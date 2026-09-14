import { NextResponse, type NextRequest } from "next/server";
import { address } from "@solana/kit";
import Decimal from "decimal.js";
import { z } from "zod";
import { buildQuote } from "@draw/core";
import { chain } from "@/lib/chain";
import { publicEnv } from "@/lib/env";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  owner: z.string().min(32),
  /** Minor units, so $40.00 arrives as 4000. Never a float over the wire. */
  amountMinor: z.number().int().positive(),
});

/**
 * POST /api/quote
 *
 * Prices a draw against live reserve state. Deliberately recomputed from
 * scratch every time rather than trusting anything the client sends beyond the
 * amount — what is affordable is decided here.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "That request was malformed.");
    }

    const { sessionId, owner, amountMinor } = parsed.data;

    const { quote } = await buildQuote({
      rpc: chain().rpc,
      sessionId,
      owner: address(owner),
      collateralMint: publicEnv.collateralMint,
      debtMint: publicEnv.debtMint,
      amountUsd: new Decimal(amountMinor).div(100),
    });

    return NextResponse.json(quote);
  } catch (error) {
    return handleApiError(error);
  }
}
