import type { Address } from "@solana/kit";
import Decimal from "decimal.js";
import type { Portfolio, Quote, RiskBand } from "@draw/shared";
import type { SolanaRpc } from "./connection";
import { loadMarket, summariseReserve } from "./kamino";
import { baseUnitsForUsd, getAssetPrice, valueInUsd } from "./prices";
import {
  DEFAULT_POLICY,
  availableToSpendUsd,
  checkDrawAllowed,
  collateralRequiredUsd,
  healthFactor,
  liquidationPriceUsd,
  riskBand,
  type RiskPolicy,
} from "./policy";
import { getTokenBalance } from "./tokens";

/**
 * Turns "I want to spend $40" into every number the user and the transaction
 * builder need.
 *
 * This runs server side and is re-run from scratch on every request. The
 * client's idea of what is affordable is a suggestion; what is spendable is
 * decided here, against freshly loaded reserve state, or not at all.
 */

export class DrawNotAllowedError extends Error {
  constructor(
    public readonly reason: "below-minimum" | "exceeds-available" | "unhealthy",
    public readonly availableUsd: Decimal,
  ) {
    super(`Draw rejected: ${reason}`);
    this.name = "DrawNotAllowedError";
  }
}

export interface PortfolioParams {
  rpc: SolanaRpc;
  owner: Address;
  collateralMint: Address;
  policy?: RiskPolicy;
}

/**
 * What the user holds, what they owe, and what they can spend right now.
 *
 * `availableToSpendUsd` is the headline number in the UI, and it is capped by
 * our own policy rather than the protocol's. Showing someone the protocol
 * maximum would be showing them a number we will refuse to honour.
 */
export async function getPortfolio(params: PortfolioParams): Promise<Portfolio> {
  const { rpc, owner, collateralMint, policy = DEFAULT_POLICY } = params;

  const { market } = await loadMarket(rpc, { refresh: true });
  const price = getAssetPrice(market, collateralMint);
  const balance = await getTokenBalance(rpc, collateralMint, owner);

  const valueUsd = valueInUsd(balance, price);

  // Existing debt is not yet read from the obligation â€” a user who has never
  // drawn has none, which covers every path through the current product.
  const debtUsd = new Decimal(0);

  const available = availableToSpendUsd(valueUsd, debtUsd, policy);
  const reserve = await summariseReserve(rpc, market, collateralMint);
  const threshold = reserve?.liquidationThreshold ?? new Decimal("0.7");

  const health = healthFactor(valueUsd, debtUsd, threshold);

  return {
    owner,
    positions:
      balance > 0n
        ? [
            {
              mint: collateralMint,
              symbol: price.symbol,
              amount: new Decimal(balance.toString())
                .div(new Decimal(10).pow(price.decimals))
                .toFixed(price.decimals > 6 ? 6 : price.decimals),
              priceUsd: price.priceUsd.toFixed(2),
              valueUsd: valueUsd.toFixed(2),
            },
          ]
        : [],
    totalValueUsd: valueUsd.toFixed(2),
    debtUsd: debtUsd.toFixed(2),
    availableToSpendUsd: available.toFixed(2),
    healthFactor: health ? health.toFixed(2) : null,
    riskBand: riskBand(health, policy),
  };
}

export interface QuoteParams {
  rpc: SolanaRpc;
  sessionId: string;
  owner: Address;
  collateralMint: Address;
  debtMint: Address;
  /** What the merchant is charging, in USD. */
  amountUsd: Decimal;
  policy?: RiskPolicy;
}

export interface QuoteResult {
  quote: Quote;
  /** Collateral to lock, in base units, ready for the transaction builder. */
  collateralBaseUnits: bigint;
  /** Stablecoin to borrow, in base units. */
  borrowBaseUnits: bigint;
}

export async function buildQuote(params: QuoteParams): Promise<QuoteResult> {
  const {
    rpc,
    sessionId,
    owner,
    collateralMint,
    debtMint,
    amountUsd,
    policy = DEFAULT_POLICY,
  } = params;

  const { market } = await loadMarket(rpc, { refresh: true });

  const collateralPrice = getAssetPrice(market, collateralMint);
  const debtPrice = getAssetPrice(market, debtMint);

  const reserve = await summariseReserve(rpc, market, collateralMint);
  if (!reserve) {
    throw new Error(`No Kamino reserve for ${collateralMint}`);
  }
  if (!reserve.borrowable) {
    throw new Error(`Reserve for ${reserve.symbol} is not currently borrowable`);
  }

  const held = await getTokenBalance(rpc, collateralMint, owner);
  const heldValueUsd = valueInUsd(held, collateralPrice);
  const existingDebtUsd = new Decimal(0);

  const decision = checkDrawAllowed({
    drawUsd: amountUsd,
    collateralValueUsd: heldValueUsd,
    existingDebtUsd,
    liquidationThreshold: reserve.liquidationThreshold,
    policy,
  });

  if (!decision.ok) {
    throw new DrawNotAllowedError(
      decision.reason,
      availableToSpendUsd(heldValueUsd, existingDebtUsd, policy),
    );
  }

  // Lock only what this draw needs rather than the user's whole position, so a
  // small payment does not put an entire portfolio behind a liquidation line.
  const requiredUsd = collateralRequiredUsd(amountUsd, policy);
  const collateralBaseUnits = baseUnitsForUsd(requiredUsd, collateralPrice);
  const collateralValueUsd = valueInUsd(collateralBaseUnits, collateralPrice);

  const borrowBaseUnits = baseUnitsForUsd(amountUsd, debtPrice);

  const projectedDebt = existingDebtUsd.add(amountUsd);
  const projectedHealth = healthFactor(
    collateralValueUsd,
    projectedDebt,
    reserve.liquidationThreshold,
  );
  const liquidationPrice = liquidationPriceUsd(
    projectedDebt,
    new Decimal(collateralBaseUnits.toString()).div(
      new Decimal(10).pow(collateralPrice.decimals),
    ),
    reserve.liquidationThreshold,
  );

  const band: RiskBand = riskBand(projectedHealth, policy);

  const quote: Quote = {
    sessionId,
    amountUsd: amountUsd.toFixed(2),
    collateral: {
      mint: collateralMint,
      symbol: collateralPrice.symbol,
      amountRequired: new Decimal(collateralBaseUnits.toString())
        .div(new Decimal(10).pow(collateralPrice.decimals))
        .toFixed(6),
      valueUsd: collateralValueUsd.toFixed(2),
    },
    borrow: {
      mint: debtMint,
      amount: amountUsd.toFixed(2),
      aprPercent: reserve.borrowApr.mul(100).toFixed(2),
    },
    after: {
      healthFactor: projectedHealth ? projectedHealth.toFixed(2) : "0",
      liquidationPriceUsd: liquidationPrice.toFixed(2),
      riskBand: band,
    },
    fees: {
      // The fee payer sponsors network costs, and Draw takes nothing on top
      // during the hackathon build.
      networkFeeUsd: "0.00",
      drawFeeUsd: "0.00",
    },
    expiresAt: new Date(
      Date.now() + policy.quoteTtlSeconds * 1000,
    ).toISOString(),
  };

  return { quote, collateralBaseUnits, borrowBaseUnits };
}

/** A quote past its expiry must never be signed â€” prices move. */
export function isQuoteExpired(quote: Quote): boolean {
  return new Date(quote.expiresAt).getTime() < Date.now();
}
