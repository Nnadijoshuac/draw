import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { api, convex } from "@/lib/convex";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().default("USD"),
  reference: z.string().optional(),
  /** Where the checkout was opened from. Must match a registered merchant. */
  origin: z.string().url(),
});

/**
 * POST /api/sessions
 *
 * A merchant declares what they are charging. Nothing is priced here — the
 * quote happens once we know who is paying.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "That request was malformed.");
    }

    const { amountMinor, currency, reference, origin } = parsed.data;
    const client = convex();

    // The origin is the security boundary: it decides who may receive the
    // result of this checkout, so an unregistered one is refused outright.
    const merchant = await client.query(api.merchants.findByOrigin, {
      origin: new URL(origin).origin,
    });

    if (!merchant) {
      return jsonError(403, "unknown_merchant", "That site is not set up to take payments.");
    }

    const sessionId = await client.mutation(api.sessions.create, {
      merchantId: merchant._id,
      amountMinor,
      currency,
      reference,
    });

    return NextResponse.json({
      id: sessionId,
      status: "pending",
      checkoutUrl: new URL(
        `/checkout?sid=${sessionId}`,
        request.nextUrl.origin,
      ).toString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
