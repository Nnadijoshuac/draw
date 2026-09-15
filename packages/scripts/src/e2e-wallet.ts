import {
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
  getBase58Encoder,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
} from "@solana/kit";
import {
  buildDrawTransaction,
  buildQuote,
  buildSendTransaction,
  checkRecipient,
  createChainClient,
  getAta,
  getPortfolio,
  getTokenBalance,
} from "@draw/core";
import Decimal from "decimal.js";
import { env } from "./env";

/**
 * The two paths a merchant is not involved in: draw to your own wallet, then
 * send it somewhere else.
 *
 * Runs against a freshly generated recipient every time, which is the case
 * worth proving — a wallet with no account and no token account at all. That is
 * the transfer most likely to fail in a way nobody notices until a real person
 * tries it.
 *
 *   pnpm --filter @draw/scripts exec tsx src/e2e-wallet.ts <user-secret-key> [amount-usd]
 */

function keypairFromBase58(secret: string) {
  return createKeyPairSignerFromBytes(
    new Uint8Array(getBase58Encoder().encode(secret)),
  );
}

async function main(): Promise<void> {
  const [userSecret, amountArg] = process.argv.slice(2);
  if (!userSecret) {
    console.error("Usage: e2e-wallet <user-secret-key> [amount-usd]");
    process.exit(1);
  }

  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });
  const user = await keypairFromBase58(userSecret);
  const feePayer = await keypairFromBase58(process.env.FEE_PAYER_SECRET_KEY ?? "");
  const amountUsd = new Decimal(amountArg ?? "25");

  console.log(`user      ${user.address}`);
  console.log(`fee payer ${feePayer.address}`);

  async function sendSigned(wireTransaction: string, label: string) {
    const decoded = getTransactionDecoder().decode(
      new Uint8Array(getBase64Encoder().encode(wireTransaction)),
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
      console.error(`\n${label} simulation failed: ${detail}`);
      for (const log of sim.value.logs ?? []) console.error(`  ${log}`);
      process.exit(1);
    }

    const signature = await rpc
      .sendTransaction(wire, { encoding: "base64", skipPreflight: true })
      .send();

    console.log(`  landed (${sim.value.unitsConsumed ?? "?"} CU): ${signature}`);
    return signature;
  }

  const cashBefore = await getTokenBalance(rpc, env.debtMint, user.address);
  console.log(`\ncash before  $${(Number(cashBefore) / 1e6).toFixed(2)}`);

  // 1. Draw to self. Same builder as a merchant payment, destination is the
  //    user, which should drop the transfer instruction entirely.
  const { collateralBaseUnits, borrowBaseUnits, quote } = await buildQuote({
    rpc,
    sessionId: "e2e-wallet",
    owner: user.address,
    collateralMint: env.collateralMint,
    debtMint: env.debtMint,
    amountUsd,
  });

  console.log(
    `\ndraw $${quote.borrow.amount} against ${quote.collateral.amountRequired} ${quote.collateral.symbol}`,
  );

  const draw = await buildDrawTransaction({
    rpc,
    user: user.address,
    destination: user.address,
    collateralMint: env.collateralMint,
    collateralAmount: collateralBaseUnits,
    debtMint: env.debtMint,
    borrowAmount: borrowBaseUnits,
    feePayer: feePayer.address,
    lookupTableAddresses: env.lookupTables,
    skipSetupCheck: true,
  });

  console.log(`  ${draw.labels.length} ixs, ${draw.sizeBytes}/1232 bytes`);
  if (draw.labels.includes("payDestination")) {
    console.error("  a self-draw should not forward anything");
    process.exit(1);
  }
  await sendSigned(draw.wireTransaction, "draw");

  const cashAfter = await getTokenBalance(rpc, env.debtMint, user.address);
  console.log(`\ncash after   $${(Number(cashAfter) / 1e6).toFixed(2)}`);

  // 2. Send it on to a wallet that has never existed. No account, no token
  //    account, nothing — the case a naive transfer fails on.
  const stranger = await generateKeyPairSigner();
  console.log(`\nstranger  ${stranger.address}`);

  const check = await checkRecipient(rpc, stranger.address, user.address);
  console.log(
    `  check: ${check.ok ? `ok, funded=${check.funded}` : `refused (${check.problem})`}`,
  );
  if (!check.ok) process.exit(1);

  const sendAmount = 5_000_000n;
  const send = await buildSendTransaction({
    rpc,
    from: user.address,
    to: stranger.address,
    mint: env.debtMint,
    amount: sendAmount,
    feePayer: feePayer.address,
  });

  console.log(`\nsend $5.00: ${send.labels.length} ixs, ${send.sizeBytes}/1232 bytes`);
  send.labels.forEach((label, i) => console.log(`  ${i}. ${label}`));
  await sendSigned(send.wireTransaction, "send");

  const received = await getTokenBalance(rpc, env.debtMint, stranger.address);
  console.log(`\nstranger holds $${(Number(received) / 1e6).toFixed(2)}`);

  // 3. The addresses that must be refused. These are the ones that lose money
  //    silently, so a passing draw and send prove only half of it.
  console.log("\nrefusals");

  const { address: usdcAta } = await getAta(rpc, env.debtMint, user.address);
  const cases: Array<[string, string]> = [
    ["a token account", usdcAta],
    ["a program", "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"],
    ["nonsense", "not-an-address"],
  ];

  for (const [what, value] of cases) {
    const verdict = await checkRecipient(rpc, value, user.address);
    if (verdict.ok) {
      console.error(`  ${what.padEnd(16)} ACCEPTED — it should not have been`);
      process.exit(1);
    }
    console.log(`  ${what.padEnd(16)} refused (${verdict.problem})`);
  }

  // 4. The balance sheet the portfolio screen renders.
  const portfolio = await getPortfolio({
    rpc,
    owner: user.address,
    collateralMint: env.collateralMint,
    debtMint: env.debtMint,
  });

  console.log("\nbalance sheet");
  console.log(`  you own      $${portfolio.totalValueUsd}`);
  console.log(`  you hold     $${portfolio.cashUsd}`);
  console.log(`  you owe      $${portfolio.debtUsd}`);
  console.log(`  to close     $${portfolio.costToCloseUsd}`);
  console.log(`  shortfall    $${portfolio.repayShortfallUsd}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
