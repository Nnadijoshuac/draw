import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  DEFAULT_POLICY,
  availableToSpendUsd,
  checkDrawAllowed,
  checkPegAcceptable,
  collateralRequiredUsd,
  healthFactor,
  liquidationPriceUsd,
  priceDropToLiquidationPercent,
  riskBand,
} from "./policy";

const d = (v: string | number) => new Decimal(v);

// A position of 1.42 NVDAx at $139.72, which is the example carried through
// the product copy.
const COLLATERAL_USD = d("198.40");
const LIQUIDATION_THRESHOLD = d("0.70");

describe("availableToSpendUsd", () => {
  it("caps spending at the policy LTV, not the protocol maximum", () => {
    const available = availableToSpendUsd(COLLATERAL_USD, d(0));
    expect(available.toFixed(2)).toBe("69.44");
  });

  it("subtracts debt the user already carries", () => {
    const available = availableToSpendUsd(COLLATERAL_USD, d("20"));
    expect(available.toFixed(2)).toBe("49.44");
  });

  it("never goes negative when debt exceeds the ceiling", () => {
    const available = availableToSpendUsd(COLLATERAL_USD, d("500"));
    expect(available.toString()).toBe("0");
  });

  it("returns zero for an empty portfolio", () => {
    expect(availableToSpendUsd(d(0), d(0)).toString()).toBe("0");
  });
});

describe("collateralRequiredUsd", () => {
  it("inverts the LTV cap", () => {
    expect(collateralRequiredUsd(d("35")).toFixed(2)).toBe("100.00");
  });
});

describe("healthFactor", () => {
  it("is null when nothing is borrowed", () => {
    expect(healthFactor(COLLATERAL_USD, d(0), LIQUIDATION_THRESHOLD)).toBeNull();
  });

  it("reflects collateral against debt", () => {
    const hf = healthFactor(COLLATERAL_USD, d("40"), LIQUIDATION_THRESHOLD);
    expect(hf?.toFixed(2)).toBe("3.47");
  });

  it("falls below 1 once debt outruns the threshold value", () => {
    const hf = healthFactor(COLLATERAL_USD, d("150"), LIQUIDATION_THRESHOLD);
    expect(hf?.lt(1)).toBe(true);
  });
});

describe("riskBand", () => {
  it("reports none without debt", () => {
    expect(riskBand(null)).toBe("none");
  });

  it("reports safe above the warn threshold", () => {
    expect(riskBand(d("2.0"))).toBe("safe");
  });

  it("treats the warn threshold itself as safe", () => {
    expect(riskBand(DEFAULT_POLICY.warnHealthFactor)).toBe("safe");
  });

  it("reports warn between the thresholds", () => {
    expect(riskBand(d("1.4"))).toBe("warn");
  });

  it("reports danger below the danger threshold", () => {
    expect(riskBand(d("1.1"))).toBe("danger");
  });
});

describe("liquidationPriceUsd", () => {
  it("finds the price at which the position is liquidatable", () => {
    const price = liquidationPriceUsd(d("40"), d("1.42"), LIQUIDATION_THRESHOLD);
    expect(price.toFixed(2)).toBe("40.24");
  });

  it("is zero when there is no collateral to value", () => {
    expect(liquidationPriceUsd(d("40"), d(0), LIQUIDATION_THRESHOLD).toString()).toBe("0");
  });
});

describe("priceDropToLiquidationPercent", () => {
  it("expresses the buffer as a percentage fall", () => {
    const drop = priceDropToLiquidationPercent(d("139.72"), d("40.24"));
    expect(drop.toFixed(0)).toBe("71");
  });

  it("clamps to zero when already below the liquidation price", () => {
    expect(priceDropToLiquidationPercent(d("30"), d("40")).toString()).toBe("0");
  });
});

describe("checkDrawAllowed", () => {
  const base = {
    collateralValueUsd: COLLATERAL_USD,
    existingDebtUsd: d(0),
    liquidationThreshold: LIQUIDATION_THRESHOLD,
  };

  it("allows a draw inside the cap", () => {
    expect(checkDrawAllowed({ ...base, drawUsd: d("40") })).toEqual({ ok: true });
  });

  it("allows a draw exactly at the cap", () => {
    expect(checkDrawAllowed({ ...base, drawUsd: d("69.44") })).toEqual({ ok: true });
  });

  it("rejects dust", () => {
    expect(checkDrawAllowed({ ...base, drawUsd: d("0.10") })).toEqual({
      ok: false,
      reason: "below-minimum",
    });
  });

  it("rejects a draw beyond what is available", () => {
    expect(checkDrawAllowed({ ...base, drawUsd: d("100") })).toEqual({
      ok: false,
      reason: "exceeds-available",
    });
  });

  it("rejects when existing debt has already used the capacity", () => {
    expect(
      checkDrawAllowed({ ...base, existingDebtUsd: d("69"), drawUsd: d("10") }),
    ).toEqual({ ok: false, reason: "exceeds-available" });
  });
});

describe("peg", () => {
  const base = {
    collateralValueUsd: d("198.40"),
    existingDebtUsd: d("0"),
    liquidationThreshold: d("0.65"),
    drawUsd: d("40"),
  };

  it("accepts a wrapper trading on top of its share", () => {
    expect(checkPegAcceptable(d("0.09"))).toBe(true);
  });

  it("accepts drift exactly at the cap", () => {
    expect(checkPegAcceptable(d("2"))).toBe(true);
  });

  it("rejects drift past the cap", () => {
    expect(checkPegAcceptable(d("2.01"))).toBe(false);
  });

  it("treats an unreadable feed as unknown, not as broken", () => {
    expect(checkPegAcceptable(null)).toBe(true);
  });

  it("refuses a draw when the collateral has come loose", () => {
    expect(
      checkDrawAllowed({ ...base, pegDriftPercent: d("6.2") }),
    ).toEqual({ ok: false, reason: "depegged" });
  });

  it("checks the peg before anything else, because it invalidates the rest", () => {
    // Dust *and* depegged. The peg is the reason that comes back, because a
    // broken peg means the amount was never the interesting problem.
    expect(
      checkDrawAllowed({ ...base, drawUsd: d("0.10"), pegDriftPercent: d("9") }),
    ).toEqual({ ok: false, reason: "depegged" });
  });

  it("allows a draw when the peg is holding", () => {
    expect(
      checkDrawAllowed({ ...base, pegDriftPercent: d("0.0918") }),
    ).toEqual({ ok: true });
  });
});
