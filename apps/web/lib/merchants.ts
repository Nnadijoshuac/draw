import "server-only";

import { address, type Address } from "@solana/kit";

/**
 * Who gets paid, resolved from the origin the checkout was opened from.
 *
 * Deliberately never taken from a request parameter. A client-supplied payee
 * means anyone can open our checkout pointed at their own wallet and have a
 * user's collateral pay them.
 *
 * The registry is configuration. That is the honest shape of it at this size —
 * one merchant, declared in the environment, read on every request. A real
 * deployment needs a table and a merchant dashboard; what it does not need is
 * a database in the payment path, because there is nothing to store that the
 * transaction signature does not already say.
 */

export interface Merchant {
  name: string;
  wallet: Address;
  origin: string;
  /** Where payment events are POSTed. Absent means this merchant gets none. */
  webhookUrl?: string;
  /** Shared secret the event is signed with. Never leaves the server. */
  webhookSecret?: string;
}

function canonicalOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function configuredMerchant(): Merchant | null {
  const origin = process.env.DEMO_MERCHANT_ORIGIN;
  const wallet = process.env.DEMO_MERCHANT_WALLET;
  if (!origin || !wallet) return null;

  return {
    name: process.env.DEMO_MERCHANT_NAME ?? "Demo store",
    wallet: address(wallet),
    origin: canonicalOrigin(origin) ?? origin,
    webhookUrl: process.env.DEMO_MERCHANT_WEBHOOK_URL,
    webhookSecret: process.env.DEMO_MERCHANT_WEBHOOK_SECRET,
  };
}

/**
 * Returns null for anything not registered, and null is the safe failure:
 * nothing can be paid rather than anything can.
 */
export async function resolveMerchant(
  originValue: string | null,
): Promise<Merchant | null> {
  if (!originValue) return null;

  const origin = canonicalOrigin(originValue);
  if (!origin) return null;

  const merchant = configuredMerchant();
  return merchant && merchant.origin === origin ? merchant : null;
}
