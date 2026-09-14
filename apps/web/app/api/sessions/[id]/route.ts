import { NextResponse, type NextRequest } from "next/server";
import { api, convex } from "@/lib/convex";
import { handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/sessions/:id — what this checkout is for, and where it has got to. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const session = await convex().query(api.sessions.get, { sessionId: id });
    if (!session) {
      return jsonError(404, "not_found", "That checkout no longer exists.");
    }

    return NextResponse.json(session);
  } catch (error) {
    return handleApiError(error);
  }
}
