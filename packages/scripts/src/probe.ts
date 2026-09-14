import { address } from "@solana/kit";
import { createChainClient, loadMarket } from "@draw/core";
import Decimal from "decimal.js";
import { env } from "./env";

/**
 * Print every reserve Kamino will lend against, so we choose the collateral
 * asset from live protocol state rather than from a blog post.
 *
 * The numbers that decide the build are the liquidation threshold, whether the
 * reserve is live, and whether it has a working oracle. A tokenized stock with
 * no reserve, or a paused one, is not something we can accept as collateral no
 * matter how good the demo would look.
 *
 *   pnpm probe          list everything
 *   pnpm probe xstock   only reserves whose symbol looks like a tokenized stock
 */

function formatPercent(value: Decimal): string {
  return `${value.mul(100).toFixed(0)}%`;
}

async function main(): Promise<void> {
  const onlyStocks = process.argv.includes("xstock");

  // Kamino runs dozens of separate markets. Allow an override so we can look
  // at any of them without editing code.
  const marketArg = process.argv.find((arg) => arg.startsWith("--market="));
  const marketAddress = marketArg
    ? address(marketArg.slice("--market=".length))
    : undefined;

  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });

  console.log(
    `Loading Kamino market ${marketAddress ?? "(default: xStocks)"} from ${env.rpcUrl} ...\n`,
  );
  const { market } = await loadMarket(rpc, { refresh: true, marketAddress });

  const reserves = market.getReserves();
  const rows = reserves
    .map((reserve) => {
      const config = reserve.state.config;
      return {
        symbol: reserve.getTokenSymbol(),
        mint: reserve.getLiquidityMint(),
        ltv: new Decimal(config.loanToValuePct.toString()).div(100),
        threshold: new Decimal(config.liquidationThresholdPct.toString()).div(100),
        live: config.status === 0,
        priced: reserve.hasValidOraclePrice(),
        price: reserve.hasValidOraclePrice()
          ? reserve.getValidOracleMarketPrice()
          : new Decimal(0),
      };
    })
    // A reserve we cannot borrow against is not a candidate, and one without a
    // working oracle cannot be priced at all.
    .filter((row) => (onlyStocks ? row.symbol.toLowerCase().includes("x") : true))
    .filter((row) => row.ltv.gt(0))
    .sort((a, b) => b.ltv.comparedTo(a.ltv));

  console.log(
    ["symbol", "ltv", "liq", "price", "status", "mint"]
      .map((h, i) => h.padEnd([10, 6, 6, 12, 8, 44][i] ?? 10))
      .join(""),
  );
  console.log("-".repeat(86));

  for (const row of rows) {
    console.log(
      [
        row.symbol.padEnd(10),
        formatPercent(row.ltv).padEnd(6),
        formatPercent(row.threshold).padEnd(6),
        (row.priced ? `$${row.price.toFixed(2)}` : "-").padEnd(12),
        (row.live ? "live" : "paused").padEnd(8),
        row.mint,
      ].join(""),
    );
  }

  console.log(`\n${rows.length} borrowable reserves.`);
  console.log(
    `Pick one that is live, priced, and has a healthy liquidation threshold, ` +
      `then set NEXT_PUBLIC_XSTOCK_MINT in .env.local.`,
  );
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

