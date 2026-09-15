import { NextResponse, type NextRequest } from "next/server";
import { address } from "@solana/kit";
import { checkRecipient, describeProblem } from "@draw/core";
import { chain } from "@/lib/chain";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/recipient?address=<address>&owner=<address>
 *
 * Is this somewhere money can safely go?
 *
 * Called while the user is still typing, so it answers rather than rejects: a
 * wallet with no account yet is a valid destination and comes back flagged, not
 * refused. The checks that do refuse are the ones that would lose the money —
 * a token account or a program address.
 */
export async function GET(request: NextRequest) {
  try {
    const value = request.nextUrl.searchParams.get("address");
    const ownerParam = request.nextUrl.searchParams.get("owner");

    if (!value) {
      return jsonError(400, "missing_address", "An address is required.");
    }

    const owner = ownerParam ? address(ownerParam) : undefined;
    const result = await checkRecipient(chain().rpc, value, owner);

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        problem: result.problem,
        message: describeProblem(result.problem),
      });
    }

    return NextResponse.json({
      ok: true,
      address: result.address,
      funded: result.funded,
      self: result.self,
      // Not an error. A brand new wallet and a mistyped one look identical from
      // here, and only the person typing knows which this is.
      warning: result.funded
        ? null
        : "This wallet has no activity yet. Check the address carefully.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
