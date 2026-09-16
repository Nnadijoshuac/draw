import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhook } from "@draw/sdk";
import { recordPaid } from "../../../orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/draw/webhook
 *
 * The merchant side of the integration, in full.
 *
 * This endpoint is a public URL and anyone can POST to it, so the signature is
 * the only thing separating a real payment from someone claiming one.
 * `verifyWebhook` does that work: constant-time MAC comparison and a five
 * minute replay window.
 *
 * Note the raw body. Reading `request.json()` and re-serialising would produce
 * different bytes and the MAC would never match — a mistake that looks like a
 * broken secret rather than a broken integration.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.DRAW_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[store] DRAW_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-draw-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await request.text();

  try {
    const event = await verifyWebhook({ secret, signature, body });

    if (event.type === "payment.paid" && event.data.signature) {
      recordPaid({
        reference: event.data.reference ?? event.data.sessionId,
        amountMinor: event.data.amountMinor,
        currency: event.data.currency,
        signature: event.data.signature,
        paidAt: event.createdAt,
      });
      console.log(`[store] order ${event.data.reference} paid`);
    }

    // 200 means "recorded, stop retrying". Anything else and Draw tries again.
    return NextResponse.json({ received: true });
  } catch (error) {
    // A bad signature is somebody else's problem, not a server fault.
    console.error("[store] rejected a webhook", error);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
}
