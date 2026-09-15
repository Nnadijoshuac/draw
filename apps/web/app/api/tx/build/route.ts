import { NextResponse, type NextRequest } from "next/server";
import { address } from "@solana/kit";
import Decimal from "decimal.js";
import { z } from "zod";
import {
  buildDrawTransaction,
  buildQuote,
  checkRecipient,
  describeProblem,
} from "@draw/core";
import { chain } from "@/lib/chain";
import { publicEnv, serverEnv } from "@/lib/env";
import { getFeePayer } from "@/lib/feePayer";
import { resolveMerchant } from "@/lib/merchants";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  owner: z.string().min(32),
  amountMinor: z.number().int().positive(),
  /** Where the checkout was opened from. The payee is derived from this. */
  origin: z.string().optional(),
  /**
   * Where to send the money, for a draw the user started themselves. Ignored
   * entirely when an origin is present. Omit to keep it.
   */
  to: z.string().min(32).optional(),
});

/**
 * POST /api/tx/build
 *
 * Returns an unsigned transaction for the browser to sign.
 *
 * The quote is recomputed here rather than accepted from the request. A client
 * that could hand us its own collateral and borrow amounts could hand us
 * favourable ones, so the only thing we take on trust is the amount being
 * charged.
 *
 * Where the money goes has two different answers, and they rest on different
 * arguments:
 *
 *   - A merchant checkout resolves the payee from the origin. The user is not
 *     naming the destination and has no way to check it, so a client-supplied
 *     one would let a crafted URL redirect someone else's payment.
 *   - A draw the user started themselves takes the destination from the
 *     request, because the user typed it, saw it, and signed for it. It is
 *     still checked against the chain before anything is built.
 *
 * An origin always wins. A merchant checkout cannot be redirected by adding a
 * parameter to it.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "That request was malformed.");
    }

    const { sessionId, owner, amountMinor, origin, to } = parsed.data;
    const { rpc } = chain();
    const user = address(owner);

    const merchantRecord = origin ? await resolveMerchant(origin) : null;

    if (origin && !merchantRecord) {
      return jsonError(
        403,
        "unknown_merchant",
        "That site isn't set up to take payments with Draw.",
      );
    }

    let destination = user;

    if (merchantRecord) {
      destination = merchantRecord.wallet;
    } else if (to) {
      const recipient = await checkRecipient(rpc, to, user);
      if (!recipient.ok) {
        return jsonError(400, "bad_recipient", describeProblem(recipient.problem));
      }
      destination = recipient.address;
    }

    const { quote, collateralBaseUnits, borrowBaseUnits } = await buildQuote({
      rpc,
      sessionId,
      owner: user,
      collateralMint: publicEnv.collateralMint,
      debtMint: publicEnv.debtMint,
      amountUsd: new Decimal(amountMinor).div(100),
    });

    const feePayer = await getFeePayer();

    const built = await buildDrawTransaction({
      rpc,
      user,
      destination,
      collateralMint: publicEnv.collateralMint,
      collateralAmount: collateralBaseUnits,
      debtMint: publicEnv.debtMint,
      borrowAmount: borrowBaseUnits,
      feePayer: feePayer.address,
      lookupTableAddresses: serverEnv.lookupTables,
      // A first-time user's account setup rides along in the same transaction.
      // It fits once the lookup table is applied, and keeping it in one
      // transaction is the point: the user sees a payment, not a setup step.
      skipSetupCheck: true,
    });

    return NextResponse.json({
      transaction: built.wireTransaction,
      sizeBytes: built.sizeBytes,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.lastValidBlockHeight.toString(),
      labels: built.labels,
      quote,
      // Echo where this is actually going, so the confirmation shows the
      // destination the server resolved rather than the one the client asked
      // for. They differ for a merchant checkout, which is the point.
      destination,
      destinationName: merchantRecord?.name ?? null,
      keeping: destination === user,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
