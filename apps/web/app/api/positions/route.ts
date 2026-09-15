import { NextResponse, type NextRequest } from "next/server";
import { address } from "@solana/kit";
import { getPortfolio } from "@draw/core";
import { chain } from "@/lib/chain";
import { publicEnv } from "@/lib/env";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/positions?owner=<address>
 *
 * What the user holds and what they can spend against it. The headline number
 * is availableToSpendUsd, which is capped by Draw's policy rather than the
 * protocol's — see packages/core/src/policy.ts for why.
 */
export async function GET(request: NextRequest) {
  try {
    const owner = request.nextUrl.searchParams.get("owner");
    if (!owner) {
      return jsonError(400, "missing_owner", "An owner address is required.");
    }

    const portfolio = await getPortfolio({
      rpc: chain().rpc,
      owner: address(owner),
      collateralMint: publicEnv.collateralMint,
      debtMint: publicEnv.debtMint,
    });

    return NextResponse.json(portfolio);
  } catch (error) {
    return handleApiError(error);
  }
}
