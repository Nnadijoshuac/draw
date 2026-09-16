import { NextResponse, type NextRequest } from "next/server";
import { getPaid } from "../../../orders";

export const dynamic = "force-dynamic";

/**
 * GET /api/draw/status?reference=order_1042
 *
 * What the shop's own server believes about an order.
 *
 * The page polls this after checkout closes rather than trusting the message
 * the popup sent it. That is the whole point of the demo: the browser says the
 * payment worked, and the shop waits to hear it from its own server.
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");
  if (!reference) {
    return NextResponse.json({ error: "reference required" }, { status: 400 });
  }

  const order = getPaid(reference);
  return NextResponse.json({ paid: order !== null, order });
}
