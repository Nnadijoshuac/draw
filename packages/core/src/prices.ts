import type { Address } from "@solana/kit";
import type { KaminoMarket } from "@kamino-finance/klend-sdk";
import Decimal from "decimal.js";

/**
 * Prices come from Kamino's own reserve oracles rather than a separate feed.
 *
 * That is deliberate. If we priced collateral from one source and the protocol
 * liquidated against another, our health factor would drift from the number
 * that actually matters, and the user would be told they were safe right up
 * until they weren't. Reading the same oracle the lending program reads keeps
 * the two in step by construction.
 */

export interface AssetPrice {
  mint: Address;
  symbol: string;
  decimals: number;
  priceUsd: Decimal;
}

export class PriceUnavailableError extends Error {
  constructor(public readonly mint: Address) {
    super(`No valid oracle price for ${mint}`);
    this.name = "PriceUnavailableError";
  }
}

/**
 * Read the current oracle price for a mint.
 *
 * A reserve that has never been refreshed with a live price reports zero, and
 * the lending program itself refuses to operate on one. We surface that as an
 * error rather than quietly pricing collateral at nothing.
 */
export function getAssetPrice(market: KaminoMarket, mint: Address): AssetPrice {
  const reserve = market.getReservesByMint(mint)[0];
  if (!reserve) {
    throw new PriceUnavailableError(mint);
  }
  if (!reserve.hasValidOraclePrice()) {
    throw new PriceUnavailableError(mint);
  }

  return {
    mint,
    symbol: reserve.getTokenSymbol(),
    decimals: reserve.getMintDecimals(),
    priceUsd: reserve.getValidOracleMarketPrice(),
  };
}

/** Value a token holding in USD. `amount` is in base units. */
export function valueInUsd(amount: bigint, price: AssetPrice): Decimal {
  const whole = new Decimal(amount.toString()).div(
    new Decimal(10).pow(price.decimals),
  );
  return whole.mul(price.priceUsd);
}

/**
 * Work out how much of a token is worth a given USD amount.
 *
 * Rounds up, because this is used to size collateral: rounding down would
 * leave a position fractionally under-collateralised against the very number
 * we just quoted.
 */
export function baseUnitsForUsd(usd: Decimal, price: AssetPrice): bigint {
  if (price.priceUsd.lte(0)) {
    throw new PriceUnavailableError(price.mint);
  }

  const whole = usd.div(price.priceUsd);
  const scaled = whole.mul(new Decimal(10).pow(price.decimals));

  return BigInt(scaled.ceil().toFixed(0));
}
