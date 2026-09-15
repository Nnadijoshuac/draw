import { NextResponse, type NextRequest } from "next/server";
import { address } from "@solana/kit";
import Decimal from "decimal.js";
import { z } from "zod";
import { buildDrawTransaction, buildQuote } from "@draw/core";
import { chain } from "@/lib/chain";
import { publicEnv, serverEnv } from "@/lib/env";
import { getFeePayer } from "@/lib/feePayer";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  owner: z.string().min(32),
  merchant: z.string().min(32),
  amountMinor: z.number().int().positive(),
  /** Kamino lookup tables, discovered by the client from a prior simulation. */
  lookupTables: z.array(z.string()).optional(),
});

/**
 * POST /api/tx/build
 *
 * Returns an unsigned transaction for the browser to sign.
 *
 * The quote is recomputed here rather than accepted from the request. A client
 * that could hand us its own collateral and borrow amounts could hand us
 * favourable ones, so the only thing we take on trust is the amount the
 * merchant is charging.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "invalid_request", "That request was malformed.");
    }

    const { sessionId, owner, merchant, amountMinor, lookupTables } = parsed.data;
    const { rpc } = chain();

    const { quote, collateralBaseUnits, borrowBaseUnits } = await buildQuote({
      rpc,
      sessionId,
      owner: address(owner),
      collateralMint: publicEnv.collateralMint,
      debtMint: publicEnv.debtMint,
      amountUsd: new Decimal(amountMinor).div(100),
    });

    const feePayer = await getFeePayer();

    const built = await buildDrawTransaction({
      rpc,
      user: address(owner),
      merchant: address(merchant),
      collateralMint: publicEnv.collateralMint,
      collateralAmount: collateralBaseUnits,
      debtMint: publicEnv.debtMint,
      borrowAmount: borrowBaseUnits,
      feePayer: feePayer.address,
      lookupTableAddresses:
        lookupTables?.map((table) => address(table)) ?? serverEnv.lookupTables,
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
    });
  } catch (error) {
    return handleApiError(error);
  }
}
