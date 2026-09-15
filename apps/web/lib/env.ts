import { readFileSync } from "node:fs";
import { join } from "node:path";
import { address, type Address } from "@solana/kit";
import { SURFNET_RPC_URL, USDC_MINT } from "@draw/core";

/**
 * Environment access, in one place, so a missing variable fails loudly at the
 * point of use rather than surfacing later as an unexplained null.
 *
 * Anything without a NEXT_PUBLIC_ prefix is server-only and must never be
 * imported into a client component. The fee payer secret in particular would
 * be a total compromise if it reached a browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Written by `pnpm reset`, which mints a new table on every fork restart. */
function readRuntimeLookupTable(): string | null {
  try {
    const file = join(process.cwd(), "..", "..", ".draw", "lookup-table");
    const value = readFileSync(file, "utf8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export const publicEnv = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? SURFNET_RPC_URL,
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",

  get collateralMint(): Address {
    return address(required("NEXT_PUBLIC_XSTOCK_MINT"));
  },

  get debtMint(): Address {
    const configured = process.env.NEXT_PUBLIC_USDC_MINT;
    return configured ? address(configured) : USDC_MINT;
  },
};

export const serverEnv = {
  get feePayerSecretKey(): string {
    return required("FEE_PAYER_SECRET_KEY");
  },

  /**
   * The shared lookup table every draw compresses against. Without it the
   * transaction is a few hundred bytes over the limit and nothing can pay.
   *
   * Read from disk on each call rather than from the environment, because a
   * fork reset mints a new table and environment variables are fixed when the
   * server boots. Needing a restart after every reset is the kind of thing
   * that fails during a demo.
   */
  get lookupTables(): Address[] {
    const fromFile = readRuntimeLookupTable();
    if (fromFile) return [address(fromFile)];

    const configured = process.env.DRAW_LOOKUP_TABLE;
    return configured ? [address(configured)] : [];
  },
};
