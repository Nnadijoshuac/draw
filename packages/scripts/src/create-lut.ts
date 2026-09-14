import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  getCreateLookupTableInstructionAsync,
  getExtendLookupTableInstruction,
} from "@solana-program/address-lookup-table";
import { collectSharedDrawAccounts, createChainClient } from "@draw/core";
import { env } from "./env";

// Create the lookup table every draw compresses against.
//
// Without one the draw is ~38 bytes over the transaction limit. Kamino makes a
// table per user during setup but leaves it empty, so we own this one: created
// once, shared by every user, holding the accounts that never change.
//
//   pnpm create-lut

const EXTEND_BATCH = 20;

async function send(
  rpc: ReturnType<typeof createChainClient>["rpc"],
  payer: KeyPairSigner,
  instructions: Instruction[],
): Promise<string> {
  const { value: blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  const signed = await signTransaction([payer.keyPair], compileTransaction(message));
  const wire = getBase64EncodedWireTransaction(signed);

  const sim = await rpc
    .simulateTransaction(wire, {
      encoding: "base64",
      replaceRecentBlockhash: false,
      sigVerify: false,
    })
    .send();

  if (sim.value.err) {
    const detail = JSON.stringify(sim.value.err, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    for (const log of sim.value.logs ?? []) console.error(`  ${log}`);
    throw new Error(`simulation failed: ${detail}`);
  }

  return rpc.sendTransaction(wire, { encoding: "base64", skipPreflight: true }).send();
}

async function main(): Promise<void> {
  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });

  const authority = await createKeyPairSignerFromBytes(
    new Uint8Array(getBase58Encoder().encode(process.env.FEE_PAYER_SECRET_KEY ?? "")),
  );

  // Two arbitrary users; only the accounts common to both end up in the table.
  const userA = await generateKeyPairSigner();
  const userB = await generateKeyPairSigner();

  const shared = await collectSharedDrawAccounts({
    rpc,
    userA: userA.address,
    userB: userB.address,
    merchant: authority.address,
    collateralMint: env.collateralMint,
    collateralAmount: 100_000_000n,
    debtMint: env.debtMint,
    borrowAmount: 1_000_000n,
    feePayer: authority.address,
  });

  console.log(`${shared.length} shared accounts`);

  const slot = await rpc.getSlot({ commitment: "finalized" }).send();
  const createIx = await getCreateLookupTableInstructionAsync({
    authority,
    payer: authority,
    recentSlot: slot,
  });

  const lut = createIx.accounts[0].address as Address;
  console.log(`creating ${lut}`);
  console.log(`  ${await send(rpc, authority, [createIx])}`);

  for (let i = 0; i < shared.length; i += EXTEND_BATCH) {
    const batch = shared.slice(i, i + EXTEND_BATCH);
    const ix = getExtendLookupTableInstruction({
      address: lut,
      authority,
      payer: authority,
      addresses: batch,
    });
    console.log(`  extend +${batch.length}: ${await send(rpc, authority, [ix])}`);
  }

  console.log(`\nAdd to .env.local:\n\nDRAW_LOOKUP_TABLE=${lut}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
