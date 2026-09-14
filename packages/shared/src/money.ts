/**
 * Money is passed across process boundaries as decimal strings, never as
 * JavaScript numbers. Floats lose precision in ways that are invisible until
 * a health factor comes back as 1.0000000000000002 and a transaction fails
 * for no apparent reason.
 *
 * Base units (the integer amount actually stored on chain) are `bigint`.
 * Display values are `DecimalString`.
 */

/** A decimal number held as a string, e.g. "198.40". */
export type DecimalString = string;

/** Smallest indivisible unit of a token, e.g. 1_000_000 for 1 USDC. */
export type BaseUnits = bigint;

export const USDC_DECIMALS = 6;

/** Convert a base-unit amount into a human decimal string. */
export function toDecimalString(amount: BaseUnits, decimals: number): DecimalString {
  const negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString().padStart(decimals + 1, "0");

  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";

  const trimmed = fraction.replace(/0+$/, "");
  const value = trimmed.length > 0 ? `${whole}.${trimmed}` : whole;

  return negative ? `-${value}` : value;
}

/**
 * Parse a human decimal string into base units.
 * Extra precision is truncated rather than rounded, so we never credit a user
 * a fraction of a unit they did not have.
 */
export function toBaseUnits(value: DecimalString, decimals: number): BaseUnits {
  const trimmed = value.trim();
  if (!/^-?\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === "-") {
    throw new Error(`Not a decimal value: ${value}`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");

  const padded = fraction.slice(0, decimals).padEnd(decimals, "0");
  const amount = BigInt(`${whole || "0"}${padded}`);

  return negative ? -amount : amount;
}

/** Format a USD amount for display. Assumes the value is already in dollars. */
export function formatUsd(value: DecimalString): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0.00";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
