import "server-only";

import type { WebhookEvent } from "@draw/shared";
import type { Merchant } from "./merchants";

/**
 * Server-to-server delivery.
 *
 * This is the merchant's source of truth, not the postMessage the browser
 * receives. A page can claim anything; a signed POST from us is the only thing
 * a merchant should ship goods against — which is what `@draw/sdk` tells them,
 * and for a long time this repository did not honour it.
 *
 * Retries are in-process and deliberately short. A durable queue belongs here
 * eventually; what does not belong is a payment route that blocks on a
 * merchant's server being awake.
 */

const RETRY_DELAYS_MS = [400, 2_000];

/** Timestamped HMAC, matching what `verifyWebhook` in the SDK expects. */
async function sign(
  secret: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );

  return Array.from(new Uint8Array(mac), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export interface PaymentNotification {
  merchant: Merchant;
  sessionId: string;
  reference?: string;
  amountMinor: number;
  currency: string;
  /** The transaction that moved the money. The merchant can verify it on chain. */
  signature: string;
  paid: boolean;
}

/**
 * Deliver one payment event.
 *
 * Never throws. The money has already moved on chain by the time this runs, so
 * a delivery failure must not turn a successful payment into an error the user
 * sees. It is logged and abandoned instead, and the signature in the response
 * is enough for a merchant to reconcile by hand.
 */
export async function notifyMerchant(
  notification: PaymentNotification,
): Promise<{ delivered: boolean; status?: number }> {
  const { merchant } = notification;

  if (!merchant.webhookUrl || !merchant.webhookSecret) {
    return { delivered: false };
  }

  const event: WebhookEvent = {
    id: `evt_${notification.signature.slice(0, 16)}`,
    type: notification.paid ? "payment.paid" : "payment.failed",
    createdAt: new Date().toISOString(),
    data: {
      sessionId: notification.sessionId,
      reference: notification.reference,
      amountMinor: notification.amountMinor,
      currency: notification.currency,
      signature: notification.signature,
    },
  };

  const body = JSON.stringify(event);

  for (let attempt = 0; ; attempt += 1) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const mac = await sign(merchant.webhookSecret, timestamp, body);

      const response = await fetch(merchant.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Signed per attempt, not once: the timestamp is inside the MAC and
          // a retry minutes later would otherwise look like a replay.
          "x-draw-signature": `t=${timestamp},v1=${mac}`,
        },
        body,
        signal: AbortSignal.timeout(4_000),
      });

      if (response.ok) return { delivered: true, status: response.status };
      if (attempt >= RETRY_DELAYS_MS.length) {
        console.error(
          `[draw:webhook] ${merchant.origin} responded ${response.status}`,
        );
        return { delivered: false, status: response.status };
      }
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        console.error(`[draw:webhook] ${merchant.origin} unreachable`, error);
        return { delivered: false };
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, RETRY_DELAYS_MS[attempt]),
    );
  }
}
