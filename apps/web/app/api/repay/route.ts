import { NextResponse, type NextRequest } from "next/server";
import { address } from "@solana/kit";
import { z } from "zod";
import { buildRepayTransaction, getObligationSummary } from "@draw/core";
import { chain } from "@/lib/chain";
import { publicEnv, serverEnv } from "@/lib/env";
import { getFeePayer } from "@/lib/feePayer";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  owner: z.string().min(32),
  /** Minor units, or omitted to clear the whole balance. */
  amountMinor: z.number().int().positive().optional(),
});

/**
 * POST /api/repay
 *
 * Pay the debt back and release the collateral. The amount owed is read from
 * chain rather than taken from the request, so a client cannot under-repay its
 * way into keeping the collateral.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "That request was malformed.");
    }

    const { owner, amountMinor } = parsed.data;
    const { rpc } = chain();

    const obligation = await getObligationSummary(
      rpc,
      address(owner),
      publicEnv.debtMint,
    );

    if (obligation.borrowedBaseUnits === 0n) {
      return jsonError(400, "nothing_owed", "You don't owe anything right now.");
    }

    // Never repay more than is owed, and default to clearing it entirely.
    const requested = amountMinor
      ? BigInt(Math.round((amountMinor / 100) * 1_000_000))
      : obligation.borrowedBaseUnits;

    const amount =
      requested > obligation.borrowedBaseUnits
        ? obligation.borrowedBaseUnits
        : requested;

    const feePayer = await getFeePayer();

    const built = await buildRepayTransaction({
      rpc,
      user: address(owner),
      debtMint: publicEnv.debtMint,
      amount,
      feePayer: feePayer.address,
      lookupTableAddresses: serverEnv.lookupTables,
    });

    return NextResponse.json({
      transaction: built.wireTransaction,
      sizeBytes: built.sizeBytes,
      labels: built.labels,
      repaidUsd: obligation.borrowedUsd.toFixed(2),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
