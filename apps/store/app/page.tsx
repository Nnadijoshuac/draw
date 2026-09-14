"use client";

import Script from "next/script";
import { useState } from "react";

/**
 * A deliberately ordinary shop.
 *
 * The point of this page is that it is unremarkable: no wallet library, no
 * chain code, no crypto vocabulary anywhere. It loads one script and renders
 * one button, which is the entire claim Draw is making.
 */

const DRAW_ORIGIN = process.env.NEXT_PUBLIC_DRAW_ORIGIN ?? "http://localhost:3000";

const PRODUCT = {
  name: "Kitui Camp Chair",
  priceMinor: 4000,
  blurb: "Folds flat. Survives a wet season.",
};

type Status =
  | { state: "idle" }
  | { state: "paid"; signature: string }
  | { state: "cancelled" }
  | { state: "error"; message: string };

export default function StorePage() {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  function pay() {
    window.Draw?.checkout({
      amount: PRODUCT.priceMinor,
      currency: "USD",
      reference: "order_1042",
      onSuccess: ({ signature }) => setStatus({ state: "paid", signature }),
      onCancel: () => setStatus({ state: "cancelled" }),
      onError: ({ message }) => setStatus({ state: "error", message }),
    });
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <Script src={`${DRAW_ORIGIN}/v1/draw.js`} strategy="afterInteractive" />

      <h1 className="text-2xl font-semibold">{PRODUCT.name}</h1>
      <p className="mt-2 text-sm text-neutral-500">{PRODUCT.blurb}</p>
      <p className="mt-6 text-3xl font-semibold">
        ${(PRODUCT.priceMinor / 100).toFixed(2)}
      </p>

      <button
        type="button"
        onClick={pay}
        className="mt-8 w-full rounded-lg bg-black px-4 py-3 text-white"
      >
        Pay with Draw
      </button>

      {status.state === "paid" && (
        <p className="mt-6 text-sm">
          Paid. Transaction{" "}
          <code className="break-all text-xs">{status.signature}</code>
        </p>
      )}
      {status.state === "cancelled" && (
        <p className="mt-6 text-sm text-neutral-500">Checkout cancelled.</p>
      )}
      {status.state === "error" && (
        <p className="mt-6 text-sm text-red-600">{status.message}</p>
      )}
    </main>
  );
}

declare global {
  interface Window {
    Draw?: {
      checkout: (options: {
        amount: number;
        currency?: string;
        reference?: string;
        onSuccess?: (r: { sessionId: string; signature: string }) => void;
        onCancel?: () => void;
        onError?: (e: { message: string }) => void;
      }) => void;
    };
  }
}
