import Decimal from "decimal.js";
import type { RiskBand } from "@draw/shared";

/**
 * Draw's own risk rules, which are deliberately stricter than the lending
 * protocol's.
 *
 * Kamino may permit something like 65% loan-to-value on a given reserve. We
 * expose roughly half of that. The gap is the user's margin for a bad week,
 * and it exists because of something specific to this asset class: tokenized
 * equities trade 24/7 but the underlying market does not, so a position opened
 * on Saturday can gap hard at Monday's open with no chance to react.
 *
 * This is a product decision, not a technical constraint.
 */
export interface RiskPolicy {
  /** Share of collateral value a user may borrow against. */
  maxLtv: Decimal;
  /** Below this health factor the UI turns amber. */
  warnHealthFactor: Decimal;
  /** Below this we refuse new draws entirely. */
  dangerHealthFactor: Decimal;
  /** Under this the network cost stops making sense. */
  minDrawUsd: Decimal;
  /** How long a quote stays signable. */
  quoteTtlSeconds: number;
}

export const DEFAULT_POLICY: RiskPolicy = {
  maxLtv: new Decimal("0.35"),
  warnHealthFactor: new Decimal("1.6"),
  dangerHealthFactor: new Decimal("1.25"),
  minDrawUsd: new Decimal("1"),
  quoteTtlSeconds: 30,
};

export function policyFromEnv(env: Record<string, string | undefined>): RiskPolicy {
  return {
    ...DEFAULT_POLICY,
    maxLtv: new Decimal(env.DRAW_MAX_LTV ?? DEFAULT_POLICY.maxLtv.toString()),
    warnHealthFactor: new Decimal(
      env.DRAW_WARN_HEALTH_FACTOR ?? DEFAULT_POLICY.warnHealthFactor.toString(),
    ),
  };
}

/**
 * How much the user may spend right now, after accounting for what they
 * already owe. Never negative.
 */
export function availableToSpendUsd(
  collateralValueUsd: Decimal,
  existingDebtUsd: Decimal,
  policy: RiskPolicy = DEFAULT_POLICY,
): Decimal {
  const ceiling = collateralValueUsd.mul(policy.maxLtv);
  return Decimal.max(ceiling.sub(existingDebtUsd), 0);
}

/** Collateral value needed to support a given draw under our own LTV cap. */
export function collateralRequiredUsd(
  drawUsd: Decimal,
  policy: RiskPolicy = DEFAULT_POLICY,
): Decimal {
  if (policy.maxLtv.lte(0)) throw new Error("maxLtv must be greater than zero");
  return drawUsd.div(policy.maxLtv);
}

/**
 * collateral x liquidation threshold / debt.
 *
 * Below 1.0 the position is liquidatable. Returns null when there is no debt,
 * because a position with nothing borrowed against it has no health to speak
 * of and showing "infinity" in the UI helps nobody.
 */
export function healthFactor(
  collateralValueUsd: Decimal,
  debtUsd: Decimal,
  liquidationThreshold: Decimal,
): Decimal | null {
  if (debtUsd.lte(0)) return null;
  return collateralValueUsd.mul(liquidationThreshold).div(debtUsd);
}

export function riskBand(
  health: Decimal | null,
  policy: RiskPolicy = DEFAULT_POLICY,
): RiskBand {
  if (health === null) return "none";
  if (health.gte(policy.warnHealthFactor)) return "safe";
  if (health.gte(policy.dangerHealthFactor)) return "warn";
  return "danger";
}

/**
 * The collateral price at which this position becomes liquidatable.
 *
 * This is the number worth putting in front of a user. "Health factor 1.42"
 * means nothing to someone who just wants to buy a thing; "your position is at
 * risk if NVDA drops below $82.40" is immediately legible.
 */
export function liquidationPriceUsd(
  debtUsd: Decimal,
  collateralAmount: Decimal,
  liquidationThreshold: Decimal,
): Decimal {
  if (collateralAmount.lte(0) || liquidationThreshold.lte(0)) {
    return new Decimal(0);
  }
  return debtUsd.div(collateralAmount.mul(liquidationThreshold));
}

/** How far the collateral can fall before trouble, as a percentage. */
export function priceDropToLiquidationPercent(
  currentPriceUsd: Decimal,
  liquidationPrice: Decimal,
): Decimal {
  if (currentPriceUsd.lte(0)) return new Decimal(0);
  const drop = currentPriceUsd.sub(liquidationPrice).div(currentPriceUsd).mul(100);
  return Decimal.max(drop, 0);
}

export type DrawRejection =
  | { ok: true }
  | { ok: false; reason: "below-minimum" | "exceeds-available" | "unhealthy" };

/**
 * Gate a draw before we build anything. Every one of these must be checked
 * server side — the client's idea of what is affordable is a suggestion.
 */
export function checkDrawAllowed(params: {
  drawUsd: Decimal;
  collateralValueUsd: Decimal;
  existingDebtUsd: Decimal;
  liquidationThreshold: Decimal;
  policy?: RiskPolicy;
}): DrawRejection {
  const {
    drawUsd,
    collateralValueUsd,
    existingDebtUsd,
    liquidationThreshold,
    policy = DEFAULT_POLICY,
  } = params;

  if (drawUsd.lt(policy.minDrawUsd)) {
    return { ok: false, reason: "below-minimum" };
  }

  const available = availableToSpendUsd(collateralValueUsd, existingDebtUsd, policy);
  if (drawUsd.gt(available)) {
    return { ok: false, reason: "exceeds-available" };
  }

  const projected = healthFactor(
    collateralValueUsd,
    existingDebtUsd.add(drawUsd),
    liquidationThreshold,
  );
  if (projected !== null && projected.lt(policy.dangerHealthFactor)) {
    return { ok: false, reason: "unhealthy" };
  }

  return { ok: true };
}
