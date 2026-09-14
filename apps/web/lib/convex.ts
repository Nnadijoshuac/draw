import "server-only";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { publicEnv } from "./env";

/**
 * Convex holds merchants and checkout sessions — the coordination a public
 * ledger is the wrong place for. Nothing here is money; balances, debt and the
 * payment itself live on Solana.
 *
 * Function references are written by hand rather than imported from
 * convex/_generated, which only exists after `convex dev` has run. Same wire
 * format; swap to the generated api once codegen is in the repo.
 */

let client: ConvexHttpClient | null = null;

export function convex(): ConvexHttpClient {
  if (!publicEnv.convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  if (!client) {
    client = new ConvexHttpClient(publicEnv.convexUrl);
  }
  return client;
}

export const api = {
  merchants: {
    findByOrigin: makeFunctionReference<"query">("merchants:findByOrigin"),
    register: makeFunctionReference<"mutation">("merchants:register"),
  },
  sessions: {
    get: makeFunctionReference<"query">("sessions:get"),
    create: makeFunctionReference<"mutation">("sessions:create"),
    attachWallet: makeFunctionReference<"mutation">("sessions:attachWallet"),
    recordQuote: makeFunctionReference<"mutation">("sessions:recordQuote"),
    setStatus: makeFunctionReference<"mutation">("sessions:setStatus"),
  },
} as const;
