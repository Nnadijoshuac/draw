import "server-only";

import { address, type Address } from "@solana/kit";
import { api, convex } from "./convex";
import { publicEnv } from "./env";

/**
 * Who gets paid, resolved from the origin the checkout was opened from.
 *
 * Deliberately never taken from a request parameter. A client-supplied payee
 * means anyone can open our checkout pointed at their own wallet and have a
 * user's collateral pay them.
 */

export interface Merchant {
  name: string;
  wallet: Address;
  origin: string;
}

function canonicalOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** The demo store, configured in env until Convex holds the registry. */
function demoMerchant(): Merchant | null {
  const origin = process.env.DEMO_MERCHANT_ORIGIN;
  const wallet = process.env.DEMO_MERCHANT_WALLET;
  if (!origin || !wallet) return null;

  return {
    name: process.env.DEMO_MERCHANT_NAME ?? "Demo store",
    wallet: address(wallet),
    origin: canonicalOrigin(origin) ?? origin,
  };
}

export async function resolveMerchant(
  originValue: string | null,
): Promise<Merchant | null> {
  if (!originValue) return null;

  const origin = canonicalOrigin(originValue);
  if (!origin) return null;

  const demo = demoMerchant();
  if (demo && demo.origin === origin) return demo;

  // Convex is the real registry. Absent or unreachable, only the demo store
  // can take payments, which is the safe failure.
  if (!publicEnv.convexUrl) return null;

  try {
    const record = await convex().query(api.merchants.findByOrigin, { origin });
    if (!record) return null;

    return {
      name: record.name as string,
      wallet: address(record.wallet as string),
      origin,
    };
  } catch {
    return null;
  }
}
