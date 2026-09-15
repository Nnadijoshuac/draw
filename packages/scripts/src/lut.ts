import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
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
import { collectSharedDrawAccounts, type SolanaRpc } from "@draw/core";

// The lookup table every draw compresses against. Without one the draw is a
// few hundred bytes over the transaction limit and nothing can pay.
//
// It has to be recreated whenever the fork restarts, since surfnet keeps no
// state between runs.

const EXTEND_BATCH = 20;

export async function sendAs(
  rpc: SolanaRpc,
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

export interface DrawLookupTable {
  table: Address;
  /** The accounts it holds, which are also the ones worth keeping fresh. */
  accounts: Address[];
}

export async function createDrawLookupTable(params: {
  rpc: SolanaRpc;
  authority: KeyPairSigner;
  collateralMint: Address;
  debtMint: Address;
  quiet?: boolean;
}): Promise<DrawLookupTable> {
  const { rpc, authority, collateralMint, debtMint, quiet } = params;
  const log = (line: string) => {
    if (!quiet) console.log(line);
  };

  // Two arbitrary users; only accounts common to both are shared, so anything
  // user-specific drops out and the table works for everyone.
  const userA = await generateKeyPairSigner();
  const userB = await generateKeyPairSigner();

  const shared = await collectSharedDrawAccounts({
    rpc,
    userA: userA.address,
    userB: userB.address,
    destination: authority.address,
    collateralMint,
    collateralAmount: 100_000_000n,
    debtMint,
    borrowAmount: 1_000_000n,
    feePayer: authority.address,
  });

  log(`  ${shared.length} shared accounts`);

  const slot = await rpc.getSlot({ commitment: "finalized" }).send();
  const createIx = await getCreateLookupTableInstructionAsync({
    authority,
    payer: authority,
    recentSlot: slot,
  });

  const table = createIx.accounts[0].address as Address;
  await sendAs(rpc, authority, [createIx]);

  for (let i = 0; i < shared.length; i += EXTEND_BATCH) {
    const batch = shared.slice(i, i + EXTEND_BATCH);
    await sendAs(rpc, authority, [
      getExtendLookupTableInstruction({
        address: table,
        authority,
        payer: authority,
        addresses: batch,
      }),
    ]);
  }

  log(`  lookup table ${table}`);
  return { table, accounts: shared };
}
