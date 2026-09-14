import { NextResponse, type NextRequest } from "next/server";
import { resolveMerchant } from "@/lib/merchants";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/merchant?origin=https://shop.example
 *
 * Tells the checkout who it is paying, so the user sees a name rather than an
 * address. Returns only public fields.
 */
export async function GET(request: NextRequest) {
  try {
    const merchant = await resolveMerchant(
      request.nextUrl.searchParams.get("origin"),
    );

    if (!merchant) {
      return jsonError(
        404,
        "unknown_merchant",
        "That site isn't set up to take payments with Draw.",
      );
    }

    return NextResponse.json({
      name: merchant.name,
      wallet: merchant.wallet,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
