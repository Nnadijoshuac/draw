import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Draw keeps almost nothing off chain.
 *
 * Balances, debt, collateral and the payment itself all live on Solana, where
 * they are verifiable and outlive us. What is left here is the coordination
 * that a ledger is the wrong place for: who a merchant is, what a checkout is
 * for, and whether it has completed yet.
 *
 * The test for anything added to this schema: if losing the database would let
 * someone steal funds, it does not belong here. If losing it means merchants
 * have to register again, that is the right side of the line.
 *
 * Note there is no payments table. The transaction signature is the receipt,
 * and it is already on chain.
 */

export const sessionStatus = v.union(
  v.literal("pending"), // created by a merchant, nobody has opened it
  v.literal("quoted"), // user is looking at real numbers
  v.literal("signing"), // transaction built, waiting on the user
  v.literal("submitted"), // sent to the network
  v.literal("paid"), // confirmed
  v.literal("failed"),
  v.literal("expired"),
);

export default defineSchema({
  merchants: defineTable({
    name: v.string(),
    /** Where the borrowed stablecoin is sent. */
    wallet: v.string(),
    /**
     * Exact origin allowed to receive checkout results. Never a wildcard —
     * postMessage to "*" would hand payment outcomes to any page listening.
     */
    origin: v.string(),
    webhookUrl: v.optional(v.string()),
    /** Signs webhook payloads so merchants can trust what we send them. */
    webhookSecret: v.string(),
  }).index("by_origin", ["origin"]),

  sessions: defineTable({
    merchantId: v.id("merchants"),
    /** Minor units, so $40.00 is 4000. Never a float. */
    amountMinor: v.number(),
    currency: v.string(),
    /** The merchant's own order id, echoed back on the webhook. */
    reference: v.optional(v.string()),
    status: sessionStatus,

    /** Set once a user opens the checkout and authenticates. */
    userWallet: v.optional(v.string()),
    /** Last quote shown, kept so we can verify what the user agreed to. */
    quote: v.optional(v.any()),
    signature: v.optional(v.string()),
    error: v.optional(v.string()),

    expiresAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_merchant", ["merchantId"]),
});
