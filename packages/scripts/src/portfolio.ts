import { address } from "@solana/kit";
import { createChainClient, getPortfolio, buildQuote } from "@draw/core";
import Decimal from "decimal.js";
import { env } from "./env";

/**
 * Read a wallet's position and price a draw against it, without touching the
 * browser.
 *
 * This exercises nearly the whole read path in one go: the Token-2022
 * resolver, the Kamino market load, oracle pricing and the risk policy. If
 * this prints sensible numbers, the only thing left unproven is signing.
 *
 *   pnpm portfolio <wallet> [amount-usd]
 */

async function main(): Promise<void> {
  const [walletArg, amountArg] = process.argv.slice(2);
  if (!walletArg) {
    console.error("Usage: pnpm portfolio <wallet> [amount-usd]");
    process.exit(1);
  }

  const owner = address(walletArg);
  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });

  const portfolio = await getPortfolio({
    rpc,
    owner,
    collateralMint: env.collateralMint,
    debtMint: env.debtMint,
  });

  console.log("\nPortfolio");
  console.log("---------");
  for (const position of portfolio.positions) {
    console.log(
      `  ${position.symbol.padEnd(8)} ${position.amount.padStart(14)}  @ $${position.priceUsd}  = $${position.valueUsd}`,
    );
  }
  console.log(`  total value        $${portfolio.totalValueUsd}`);
  console.log(`  debt               $${portfolio.debtUsd}`);
  console.log(`  available to spend $${portfolio.availableToSpendUsd}`);
  console.log(`  risk               ${portfolio.riskBand}`);

  const amountUsd = new Decimal(amountArg ?? "40");
  console.log(`\nQuote for $${amountUsd.toFixed(2)}`);
  console.log("---------------");

  const { quote, collateralBaseUnits, borrowBaseUnits } = await buildQuote({
    rpc,
    sessionId: "probe",
    owner,
    collateralMint: env.collateralMint,
    debtMint: env.debtMint,
    amountUsd,
  });

  console.log(
    `  lock     ${quote.collateral.amountRequired} ${quote.collateral.symbol} ($${quote.collateral.valueUsd})`,
  );
  console.log(`  borrow   $${quote.borrow.amount} at ${quote.borrow.aprPercent}% APR`);
  console.log(`  health   ${quote.after.healthFactor} (${quote.after.riskBand})`);
  console.log(`  liquidates if price falls to $${quote.after.liquidationPriceUsd}`);
  console.log(`  expires  ${quote.expiresAt}`);
  console.log(
    `\n  base units: collateral=${collateralBaseUnits} borrow=${borrowBaseUnits}`,
  );
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
