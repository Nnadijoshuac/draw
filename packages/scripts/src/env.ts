import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { address, type Address } from "@solana/kit";
import { SURFNET_RPC_URL, USDC_MINT } from "@draw/core";

// Scripts run outside Next, so the root .env.local has to be loaded by hand.
// fileURLToPath rather than URL.pathname: on Windows the latter yields
// "/C:/Users/..." with a leading slash, which nothing can open.
config({ path: fileURLToPath(new URL("../../../.env.local", import.meta.url)) });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? SURFNET_RPC_URL,

  get collateralMint(): Address {
    return address(required("NEXT_PUBLIC_XSTOCK_MINT"));
  },

  get debtMint(): Address {
    const configured = process.env.NEXT_PUBLIC_USDC_MINT;
    return configured ? address(configured) : USDC_MINT;
  },

  get lookupTables(): Address[] {
    const configured = process.env.DRAW_LOOKUP_TABLE;
    return configured ? [address(configured)] : [];
  },
};
