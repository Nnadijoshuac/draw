import { NextResponse, type NextRequest } from "next/server";
import { address } from "@solana/kit";
import { z } from "zod";
import {
  buildSendTransaction,
  checkRecipient,
  describeProblem,
  getTokenBalance,
} from "@draw/core";
import { chain } from "@/lib/chain";
import { publicEnv } from "@/lib/env";
import { getFeePayer } from "@/lib/feePayer";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  owner: z.string().min(32),
  to: z.string().min(32),
  amountMinor: z.number().int().positive(),
});

/**
 * POST /api/send
 *
 * Move stablecoin the user already holds.
 *
 * No collateral and no borrowing, so none of the risk policy applies — this is
 * their own money. What does apply is the destination check, because a transfer
 * is final and a mistyped address is indistinguishable from a real one.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "That request was malformed.");
    }

    const { owner, to, amountMinor } = parsed.data;
    const { rpc } = chain();
    const from = address(owner);

    const recipient = await checkRecipient(rpc, to, from);
    if (!recipient.ok) {
      return jsonError(400, "bad_recipient", describeProblem(recipient.problem));
    }
    if (recipient.self) {
      return jsonError(
        400,
        "self_transfer",
        "That's your own wallet. The money is already there.",
      );
    }

    // Re-read the balance rather than trusting the amount. The client shows a
    // figure that was true when the page loaded; this one is true now.
    const amount = BigInt(Math.round((amountMinor / 100) * 1_000_000));
    const held = await getTokenBalance(rpc, publicEnv.debtMint, from);

    if (amount > held) {
      return jsonError(
        400,
        "insufficient_balance",
        `You have $${(Number(held) / 1_000_000).toFixed(2)} to send.`,
      );
    }

    const feePayer = await getFeePayer();

    const built = await buildSendTransaction({
      rpc,
      from,
      to: recipient.address,
      mint: publicEnv.debtMint,
      amount,
      feePayer: feePayer.address,
    });

    return NextResponse.json({
      transaction: built.wireTransaction,
      sizeBytes: built.sizeBytes,
      labels: built.labels,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
