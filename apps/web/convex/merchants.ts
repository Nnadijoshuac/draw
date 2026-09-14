import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Merchants.
 *
 * A merchant is mostly a wallet plus two security facts: the exact origin
 * allowed to receive checkout results, and the secret their webhooks are
 * signed with. Both matter more than they look — the origin is what stops a
 * malicious page from listening in on payment outcomes, and the secret is what
 * lets a merchant distinguish our webhook from anyone else's POST.
 */

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const register = mutation({
  args: {
    name: v.string(),
    wallet: v.string(),
    origin: v.string(),
    webhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let origin: string;
    try {
      // Store the canonical origin so comparisons later are exact rather than
      // "close enough" — a trailing slash should not decide a security check.
      origin = new URL(args.origin).origin;
    } catch {
      throw new Error(`Not a valid origin: ${args.origin}`);
    }

    const existing = await ctx.db
      .query("merchants")
      .withIndex("by_origin", (q) => q.eq("origin", origin))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("merchants", {
      ...args,
      origin,
      webhookSecret: randomSecret(),
    });
  },
});

export const getPublic = query({
  args: { merchantId: v.id("merchants") },
  handler: async (ctx, { merchantId }) => {
    const merchant = await ctx.db.get(merchantId);
    if (!merchant) return null;

    return {
      _id: merchant._id,
      name: merchant.name,
      wallet: merchant.wallet,
      origin: merchant.origin,
    };
  },
});

/**
 * Full merchant row, webhook secret included. Server-side callers only —
 * `internalQuery` is not reachable from a browser, which is the whole point.
 */
export const getInternal = internalQuery({
  args: { merchantId: v.id("merchants") },
  handler: async (ctx, { merchantId }) => await ctx.db.get(merchantId),
});

export const findByOrigin = query({
  args: { origin: v.string() },
  handler: async (ctx, { origin }) => {
    return await ctx.db
      .query("merchants")
      .withIndex("by_origin", (q) => q.eq("origin", origin))
      .first();
  },
});
