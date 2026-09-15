import { address, type Address } from "@solana/kit";
import type { loadMarket } from "@draw/core";

type Market = Awaited<ReturnType<typeof loadMarket>>["market"];

// The price accounts behind every reserve.
//
// Only these are safe to keep in sync with mainnet. Re-pulling a reserve or a
// vault would overwrite it and erase every deposit made on the fork.

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

export function oracleAccountsFor(market: Market): Address[] {
  const oracles = new Set<string>();

  for (const reserve of market.getReserves()) {
    const info = reserve.state.config.tokenInfo;

    for (const candidate of [
      info.pythConfiguration?.price,
      info.scopeConfiguration?.priceFeed,
      info.switchboardConfiguration?.priceAggregator,
      info.switchboardConfiguration?.twapAggregator,
    ]) {
      const value = candidate?.toString();
      if (value && value !== SYSTEM_PROGRAM) oracles.add(value);
    }
  }

  return [...oracles].map((value) => address(value));
}
