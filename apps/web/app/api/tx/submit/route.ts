import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { chain } from "@/lib/chain";
import { coSignTransaction } from "@/lib/feePayer";
import { resolveMerchant } from "@/lib/merchants";
import { notifyMerchant } from "@/lib/webhooks";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  /** Base64 wire transaction, already signed by the user's wallet. */
  transaction: z.string().min(1),
  /** Where the checkout was opened from. Decides who gets told. */
  origin: z.string().optional(),
  amountMinor: z.number().int().positive().optional(),
  currency: z.string().optional(),
  reference: z.string().optional(),
});

/**
 * POST /api/tx/submit
 *
 * The user has signed. We add the fee payer signature and send it.
 *
 * Simulation runs first, deliberately. A transaction that is going to fail
 * should fail here, where we can explain it, rather than on chain where the
 * user has already committed and sees only a signature that went nowhere.
 *
 * Once it lands, the merchant is told server to server. That notification is
 * what a merchant should ship goods against — never the postMessage the
 * browser receives, which is exactly what `@draw/sdk` has always said and what
 * this route did not honour until now.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "That request was malformed.");
    }

    const { sessionId, origin, amountMinor, currency, reference } = parsed.data;
    const { rpc } = chain();
    const signed = await coSignTransaction(parsed.data.transaction);

    const simulation = await rpc
      .simulateTransaction(signed, {
        encoding: "base64",
        replaceRecentBlockhash: false,
        sigVerify: false,
      })
      .send();

    if (simulation.value.err) {
      console.error("[draw:simulate]", simulation.value.err, simulation.value.logs);
      return jsonError(
        400,
        "simulation_failed",
        "That payment can't go through right now. Nothing was charged.",
      );
    }

    const signature = await rpc
      .sendTransaction(signed, {
        encoding: "base64",
        skipPreflight: true, // already simulated above
        maxRetries: 3n,
      })
      .send();

    // The money has moved. Tell the merchant.
    //
    // Resolved from the origin rather than taken from the request, the same way
    // the payee is — a client that could name the recipient of the webhook
    // could point somebody else's confirmation at a server it controls.
    //
    // Awaited rather than fired and forgotten: serverless kills the process the
    // moment the response is returned, and a background promise dies with it.
    let notified = false;

    if (origin && amountMinor) {
      const merchant = await resolveMerchant(origin);
      if (merchant) {
        const result = await notifyMerchant({
          merchant,
          sessionId,
          reference,
          amountMinor,
          currency: currency ?? "USD",
          signature,
          paid: true,
        });
        notified = result.delivered;
      }
    }

    return NextResponse.json({
      signature,
      computeUnits: simulation.value.unitsConsumed?.toString() ?? null,
      // Whether the shop has been told yet. The payment stands either way.
      notified,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
