import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { chain } from "@/lib/chain";
import { coSignTransaction } from "@/lib/feePayer";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  /** Base64 wire transaction, already signed by the user's wallet. */
  transaction: z.string().min(1),
});

/**
 * POST /api/tx/submit
 *
 * The user has signed. We add the fee payer signature and send it.
 *
 * Simulation runs first, deliberately. A transaction that is going to fail
 * should fail here, where we can explain it, rather than on chain where the
 * user has already committed and sees only a signature that went nowhere.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "That request was malformed.");
    }

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

    return NextResponse.json({
      signature,
      computeUnits: simulation.value.unitsConsumed?.toString() ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
