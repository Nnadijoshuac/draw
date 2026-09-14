import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Webhook delivery.
 *
 * This is the merchant's source of truth, not the postMessage the browser
 * receives. A page can claim anything; a signed server-to-server POST from us
 * is the only thing a merchant should act on — shipping goods, for instance.
 *
 * Delivery lives in Convex rather than a Next route because retries need a
 * scheduler, and Convex has one. A webhook that fails because the merchant was
 * redeploying should land two minutes later, not be lost.
 */

const RETRY_SCHEDULE_MS = [5_000, 30_000, 120_000, 600_000];

/** Timestamped HMAC, so a replayed payload is detectable. */
async function sign(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );

  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export const dispatch = internalAction({
  args: {
    sessionId: v.id("sessions"),
    attempt: v.number(),
  },
  handler: async (ctx, { sessionId, attempt }) => {
    const session = await ctx.runQuery(internal.sessions.getInternal, { sessionId });
    if (!session) return;

    const merchant = await ctx.runQuery(internal.merchants.getInternal, {
      merchantId: session.merchantId,
    });
    if (!merchant?.webhookUrl) return;

    const event = {
      id: `evt_${sessionId}_${attempt}`,
      type: session.status === "paid" ? "payment.paid" : "payment.failed",
      createdAt: new Date().toISOString(),
      data: {
        sessionId,
        reference: session.reference,
        amountMinor: session.amountMinor,
        currency: session.currency,
        signature: session.signature,
      },
    };

    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const mac = await sign(merchant.webhookSecret, timestamp, body);

    try {
      const response = await fetch(merchant.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-draw-signature": `t=${timestamp},v1=${mac}`,
        },
        body,
      });

      if (response.ok) return;
      throw new Error(`Merchant responded ${response.status}`);
    } catch (error) {
      const delay = RETRY_SCHEDULE_MS[attempt];

      // Give up quietly after the schedule is exhausted. The payment itself
      // already succeeded on chain; a merchant who misses every delivery can
      // still reconcile from the transaction signature.
      if (delay === undefined) {
        console.error(`[draw:webhook] giving up on ${sessionId}`, error);
        return;
      }

      await ctx.scheduler.runAfter(delay, internal.webhooks.dispatch, {
        sessionId,
        attempt: attempt + 1,
      });
    }
  },
});
