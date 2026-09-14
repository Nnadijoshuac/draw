import {
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
  address,
} from "@solana/kit";
import {
  buildDrawTransaction,
  buildQuote,
  buildUserSetupTransaction,
  createChainClient,
} from "@draw/core";
import Decimal from "decimal.js";
import { env } from "./env.js";

// Full draw, headless: quote, build, sign, co-sign, send.
//
//   pnpm e2e <user-secret-key> <merchant-address> [amount-usd]

function keypairFromBase58(secret: string) {
  return createKeyPairSignerFromBytes(
    new Uint8Array(getBase58Encoder().encode(secret)),
  );
}

async function main(): Promise<void> {
  const [userSecret, merchantArg, amountArg] = process.argv.slice(2);
  if (!userSecret || !merchantArg) {
    console.error("Usage: pnpm e2e <user-secret-key> <merchant-address> [amount-usd]");
    process.exit(1);
  }

  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });
  const user = await keypairFromBase58(userSecret);
  const feePayer = await keypairFromBase58(process.env.FEE_PAYER_SECRET_KEY ?? "");
  const merchant = address(merchantArg);
  const amountUsd = new Decimal(amountArg ?? "40");

  console.log(`user      ${user.address}`);
  console.log(`fee payer ${feePayer.address}`);
  console.log(`merchant  ${merchant}`);

  const { quote, collateralBaseUnits, borrowBaseUnits } = await buildQuote({
    rpc,
    sessionId: "e2e",
    owner: user.address,
    collateralMint: env.collateralMint,
    debtMint: env.debtMint,
    amountUsd,
  });

  console.log(
    `\nlock ${quote.collateral.amountRequired} ${quote.collateral.symbol}, borrow $${quote.borrow.amount}`,
  );

  const common = {
    rpc,
    user: user.address,
    collateralMint: env.collateralMint,
    collateralAmount: collateralBaseUnits,
    debtMint: env.debtMint,
    borrowAmount: borrowBaseUnits,
    feePayer: feePayer.address,
  };

  async function sendSigned(wireTransaction: string, label: string) {
    const decoded = getTransactionDecoder().decode(
      new Uint8Array(getBase64Encoder().encode(wireTransaction)),
    );

    // User signs first, fee payer second, same order as the real flow.
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
      // Solana error payloads carry bigints, which JSON.stringify refuses.
      const detail = JSON.stringify(sim.value.err, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      );
      console.error(`\n${label} simulation failed: ${detail}`);
      for (const log of sim.value.logs ?? []) console.error(`  ${log}`);
      process.exit(1);
    }

    const signature = await rpc
      .sendTransaction(wire, { encoding: "base64", skipPreflight: true })
      .send();

    console.log(`  landed (${sim.value.unitsConsumed ?? "?"} CU): ${signature}`);
  }

  // With a populated lookup table the whole thing fits in one transaction, so
  // account setup rides along with the draw and Kamino's own instruction
  // ordering is preserved. Pass --split to send setup separately instead.
  const split = process.argv.includes("--split");

  if (split) {
    const setup = await buildUserSetupTransaction(common);
    if (setup) {
      console.log(`\nsetup: ${setup.labels.length} ixs, ${setup.sizeBytes} bytes`);
      await sendSigned(setup.wireTransaction, "setup");
    }
  }

  const built = await buildDrawTransaction({
    ...common,
    merchant,
    lookupTableAddresses: env.lookupTables,
    skipSetupCheck: !split,
  });

  console.log(`\ndraw: ${built.labels.length} ixs, ${built.sizeBytes}/1232 bytes`);
  built.labels.forEach((label, i) => console.log(`  ${i}. ${label}`));
  await sendSigned(built.wireTransaction, "draw");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
