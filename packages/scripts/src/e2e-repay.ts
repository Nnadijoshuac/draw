import {
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
} from "@solana/kit";
import {
  buildRepayTransaction,
  createChainClient,
  getObligationSummary,
} from "@draw/core";
import { env } from "./env";

// Borrow then give it back. Proves the other half of the product.
//
//   pnpm --filter @draw/scripts exec tsx src/e2e-repay.ts <user-secret-key>

async function main(): Promise<void> {
  const [userSecret] = process.argv.slice(2);
  if (!userSecret) {
    console.error("Usage: e2e-repay <user-secret-key>");
    process.exit(1);
  }

  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });
  const user = await createKeyPairSignerFromBytes(
    new Uint8Array(getBase58Encoder().encode(userSecret)),
  );
  const feePayer = await createKeyPairSignerFromBytes(
    new Uint8Array(getBase58Encoder().encode(process.env.FEE_PAYER_SECRET_KEY ?? "")),
  );

  const before = await getObligationSummary(rpc, user.address, env.debtMint);
  console.log(`owed before   $${before.borrowedUsd.toFixed(2)}`);
  console.log(`collateral    $${before.depositedUsd.toFixed(2)}`);

  if (before.borrowedBaseUnits === 0n) {
    console.log("\nNothing owed. Run a draw first.");
    return;
  }

  const built = await buildRepayTransaction({
    rpc,
    user: user.address,
    debtMint: env.debtMint,
    amount: before.borrowedBaseUnits,
    feePayer: feePayer.address,
    lookupTableAddresses: env.lookupTables,
  });

  console.log(`\nrepay: ${built.labels.length} ixs, ${built.sizeBytes}/1232 bytes`);

  const decoded = getTransactionDecoder().decode(
    new Uint8Array(getBase64Encoder().encode(built.wireTransaction)),
  );
  const signed = await partiallySignTransaction(
    [user.keyPair, feePayer.keyPair],
    decoded,
  );
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
    console.error(`\nsimulation failed: ${detail}`);
    for (const log of sim.value.logs ?? []) console.error(`  ${log}`);
    process.exit(1);
  }

  const signature = await rpc
    .sendTransaction(wire, { encoding: "base64", skipPreflight: true })
    .send();

  console.log(`  landed: ${signature}`);

  const after = await getObligationSummary(rpc, user.address, env.debtMint);
  console.log(`\nowed after    $${after.borrowedUsd.toFixed(2)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
