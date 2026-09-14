import { internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sessionStatus } from "./schema";

/**
 * Checkout sessions.
 *
 * The status field is the spine of the whole payment flow. Every failure mode
 * in the app lands on one of its terminal values, which is what makes the
 * thing debuggable when a draw goes wrong at an awkward moment.
 *
 * Because these are Convex queries, the merchant page and the checkout popup
 * both subscribe to the same row and update the instant it changes. No
 * polling, and the merchant's "paid" state arrives as fast as confirmation
 * does.
 */

/** A quote stops being signable well before prices can move meaningfully. */
const SESSION_TTL_MS = 15 * 60 * 1000;

export const create = mutation({
  args: {
    merchantId: v.id("merchants"),
    amountMinor: v.number(),
    currency: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
      throw new Error("amountMinor must be a positive integer of minor units");
    }

    const merchant = await ctx.db.get(args.merchantId);
    if (!merchant) throw new Error("Unknown merchant");

    return await ctx.db.insert("sessions", {
      ...args,
      status: "pending",
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
  },
});

export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const merchant = await ctx.db.get(session.merchantId);

    // Never hand the webhook secret to a browser.
    return {
      ...session,
      merchant: merchant
        ? { name: merchant.name, wallet: merchant.wallet, origin: merchant.origin }
        : null,
      expired: session.expiresAt < Date.now(),
    };
  },
});

export const attachWallet = mutation({
  args: { sessionId: v.id("sessions"), userWallet: v.string() },
  handler: async (ctx, { sessionId, userWallet }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Unknown session");

    await ctx.db.patch(sessionId, { userWallet });
  },
});

export const recordQuote = mutation({
  args: { sessionId: v.id("sessions"), quote: v.any() },
  handler: async (ctx, { sessionId, quote }) => {
    await ctx.db.patch(sessionId, { quote, status: "quoted" });
  },
});

/**
 * Advance the session.
 *
 * Terminal states are final: a session that has already been paid must never
 * be walked backwards by a late-arriving update, or a merchant could be told a
 * completed payment failed.
 */
export const setStatus = mutation({
  args: {
    sessionId: v.id("sessions"),
    status: sessionStatus,
    signature: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, status, signature, error }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Unknown session");

    if (session.status === "paid") return;

    await ctx.db.patch(sessionId, {
      status,
      ...(signature ? { signature } : {}),
      ...(error ? { error } : {}),
    });

    // Tell the merchant's server, out of band. Their page will already have
    // updated from the live query, but a browser is not something to ship
    // goods on.
    if (status === "paid" || status === "failed") {
      await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
        sessionId,
        attempt: 0,
      });
    }
  },
});

/** Full row including merchant id. Server-side callers only. */
export const getInternal = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => await ctx.db.get(sessionId),
});

/** Sweep sessions nobody finished. Scheduled, not called from the client. */
export const expireStale = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const open = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    let expired = 0;
    for (const session of open) {
      if (session.expiresAt < now) {
        await ctx.db.patch(session._id, { status: "expired" });
        expired += 1;
      }
    }
    return { expired };
  },
});
