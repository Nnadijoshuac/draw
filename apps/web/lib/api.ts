import { NextResponse } from "next/server";
import {
  DrawNotAllowedError,
  PriceUnavailableError,
  TransactionTooLargeError,
  UserSetupRequiredError,
} from "@draw/core";

/**
 * One place that turns an internal failure into something a person can read.
 *
 * Nothing from the RPC, the lending protocol or a decoder should ever reach a
 * user verbatim. "Reserve status 2" tells them nothing; "payments with NVDAx
 * are briefly unavailable" tells them what to do next. The original error
 * still goes to the server log.
 */

export interface ApiError {
  error: string;
  code: string;
  /** Extra context the UI can use, such as what the user can actually spend. */
  details?: Record<string, string>;
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, string>,
): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code, ...(details ? { details } : {}) }, { status });
}

export function handleApiError(error: unknown): NextResponse<ApiError> {
  console.error("[draw:api]", error);

  if (error instanceof DrawNotAllowedError) {
    const available = `$${error.availableUsd.toFixed(2)}`;

    switch (error.reason) {
      case "below-minimum":
        return jsonError(400, "below_minimum", "That amount is too small to draw.");
      case "exceeds-available":
        return jsonError(
          400,
          "exceeds_available",
          `You can spend up to ${available} right now.`,
          { availableUsd: error.availableUsd.toFixed(2) },
        );
      case "unhealthy":
        return jsonError(
          400,
          "unhealthy",
          "That would put your position too close to liquidation.",
        );
      case "depegged":
        return jsonError(
          400,
          "depegged",
          "Your shares are trading away from their real price right now, so we've paused lending against them. Nothing was charged.",
        );
    }
  }

  if (error instanceof PriceUnavailableError) {
    return jsonError(
      503,
      "price_unavailable",
      "We can't price your shares right now. Try again shortly.",
    );
  }

  if (error instanceof TransactionTooLargeError) {
    return jsonError(
      500,
      "transaction_too_large",
      "We couldn't prepare that payment. Please try again.",
      { sizeBytes: String(error.sizeBytes) },
    );
  }

  if (error instanceof UserSetupRequiredError) {
    return jsonError(
      500,
      "setup_required",
      "We couldn't set up your account for this payment. Please try again.",
    );
  }

  if (error instanceof Error && error.message.includes("not currently borrowable")) {
    return jsonError(
      503,
      "reserve_unavailable",
      "Payments with this asset are briefly unavailable. Try another.",
    );
  }

  // A bare "something went wrong" hides the cause from whoever is debugging,
  // so outside production the real message comes through.
  const detail =
    process.env.NODE_ENV === "production"
      ? undefined
      : { cause: error instanceof Error ? error.message : String(error) };

  return jsonError(
    500,
    "internal",
    "Something went wrong. Please try again.",
    detail,
  );
}
