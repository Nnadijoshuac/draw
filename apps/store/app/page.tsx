"use client";

import Script from "next/script";
import { useCallback, useState } from "react";

/**
 * A deliberately ordinary shop.
 *
 * The point of this page is that it is unremarkable: no wallet library, no
 * chain code, no crypto vocabulary anywhere. It loads one script and renders
 * one button, which is the entire claim Draw is making.
 *
 * It looks like a real product page because it has to survive being filmed. A
 * bare heading and a button reads as a test harness, and a judge watching the
 * video should be thinking about the payment, not about how thin the shop is.
 */

const DRAW_ORIGIN = process.env.NEXT_PUBLIC_DRAW_ORIGIN ?? "http://localhost:3000";

const PRODUCT = {
  name: "Kitui Camp Chair",
  priceMinor: 4000,
  blurb:
    "Folds flat in one motion and survives a wet season. Powder-coated steel frame, beech armrests, and 600D recycled canvas that does not go slack after a season in the sun.",
  sku: "KTU-CC-04",
};

const REFERENCE = "order_1042";

type Status =
  | { state: "idle" }
  /** The browser says it paid. We haven't heard it from our own server yet. */
  | { state: "confirming" }
  | { state: "paid"; signature: string }
  | { state: "cancelled" }
  | { state: "error"; message: string };

export default function StorePage() {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  /**
   * Wait for the webhook.
   *
   * The popup told us the payment worked, and we are deliberately not taking
   * its word for it. A page can claim anything. The order is only confirmed
   * once our own server has verified a signed event from Draw — which is what
   * the Draw SDK docs say to do, so the demo should do it.
   */
  const waitForWebhook = useCallback(async () => {
    setStatus({ state: "confirming" });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const res = await fetch(
          `/api/draw/status?reference=${encodeURIComponent(REFERENCE)}`,
          { cache: "no-store" },
        );
        const body = await res.json();

        if (body.paid && body.order) {
          setStatus({ state: "paid", signature: body.order.signature });
          return;
        }
      } catch {
        /* keep waiting — the shop's server may just be slow */
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setStatus({
      state: "error",
      message:
        "We couldn't confirm that payment with our server. Nothing has been shipped — contact support with your order number.",
    });
  }, []);

  function pay() {
    window.Draw?.checkout({
      amount: PRODUCT.priceMinor,
      currency: "USD",
      reference: REFERENCE,
      onSuccess: () => void waitForWebhook(),
      onCancel: () => setStatus({ state: "cancelled" }),
      onError: ({ message }) => setStatus({ state: "error", message }),
    });
  }

  const price = `$${(PRODUCT.priceMinor / 100).toFixed(2)}`;

  return (
    <>
      <Script src={`${DRAW_ORIGIN}/v1/draw.js`} strategy="afterInteractive" />

      <header className="border-b border-[var(--color-line)] bg-[var(--color-card)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-serif text-[19px] tracking-[-0.01em]">
            Kitui Supply Co.
          </span>
          <nav className="hidden gap-7 text-[14px] text-[var(--color-muted)] sm:flex">
            <span>Camping</span>
            <span>Packs</span>
            <span>Outerwear</span>
            <span>Journal</span>
          </nav>
          <div className="flex items-center gap-4 text-[14px] text-[var(--color-muted)]">
            <span className="hidden sm:inline">Search</span>
            <span>Basket (1)</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-8">
        <p className="text-[13px] text-[var(--color-muted)]">
          Camping <span className="mx-1.5">/</span> Seating{" "}
          <span className="mx-1.5">/</span>{" "}
          <span className="text-[var(--color-ink)]">{PRODUCT.name}</span>
        </p>

        <div className="mt-6 grid gap-10 md:grid-cols-2 md:gap-14">
          {/* Product shot.
              A plain img, not next/image: this page gets screen-recorded, and
              the optimiser adds a first-paint round trip that can land the
              image a beat after the rest of the page. */}
          <div className="flex items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-6">
            <img
              src="/chair.jpg"
              alt="Olive folding camp chair with wooden armrests and a black steel frame"
              width={447}
              height={447}
              className="h-auto w-full max-w-[400px]"
            />
          </div>

          {/* Details */}
          <div>
            <h1 className="font-serif text-[34px] leading-tight tracking-[-0.02em]">
              {PRODUCT.name}
            </h1>

            <div className="mt-2.5 flex items-center gap-2.5 text-[14px]">
              <span className="text-[var(--color-olive)]">★★★★★</span>
              <span className="text-[var(--color-muted)]">
                4.8 · 212 reviews
              </span>
            </div>

            <p className="tabular mt-5 text-[30px] font-medium tracking-[-0.02em]">
              {price}
            </p>
            <p className="mt-1 text-[13px] text-[var(--color-muted)]">
              Free delivery over $35 · In stock
            </p>

            <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-[var(--color-muted)]">
              {PRODUCT.blurb}
            </p>

            <div className="mt-7">
              <p className="text-[13px] font-medium">Colour — Olive</p>
              <div className="mt-2.5 flex gap-2.5">
                {[
                  ["Olive", "#5C6B4A"],
                  ["Clay", "#A4664A"],
                  ["Slate", "#4A5159"],
                ].map(([name, hex], i) => (
                  <span
                    key={name}
                    title={name}
                    className={`h-8 w-8 rounded-full border-2 ${
                      i === 0
                        ? "border-[var(--color-ink)]"
                        : "border-transparent"
                    }`}
                    style={{ background: hex, boxShadow: "inset 0 0 0 2px #fff" }}
                  />
                ))}
              </div>
            </div>

            {status.state === "paid" ? (
              <Confirmation signature={status.signature} price={price} />
            ) : status.state === "confirming" ? (
              <div className="mt-8 rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
                <p className="text-[15px] font-medium">Confirming your payment</p>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-muted)]">
                  Waiting for confirmation from our payment provider. We don&apos;t
                  mark an order paid until our own server has verified it.
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={pay}
                  className="mt-8 w-full rounded-lg bg-[var(--color-ink)] py-3.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  Pay with Draw
                </button>

                <button
                  type="button"
                  className="mt-2.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] py-3.5 text-[15px] font-medium transition-colors hover:border-[var(--color-ink)]"
                >
                  Add to basket
                </button>

                <p className="mt-3.5 text-center text-[13px] text-[var(--color-muted)]">
                  Delivered in 3–5 days · Free 30-day returns
                </p>

                {status.state === "cancelled" && (
                  <p className="mt-5 rounded-lg bg-white px-3.5 py-3 text-center text-[13px] text-[var(--color-muted)]">
                    Checkout cancelled. Nothing was charged.
                  </p>
                )}
                {status.state === "error" && (
                  <p
                    className="mt-5 rounded-lg bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-[#B42318]"
                    role="alert"
                  >
                    {status.message}
                  </p>
                )}
              </>
            )}

            <dl className="mt-10 space-y-2.5 border-t border-[var(--color-line)] pt-6 text-[13px]">
              {[
                ["Frame", "Powder-coated steel, beech armrests"],
                ["Fabric", "600D recycled canvas"],
                ["Dimensions", "56 × 50 × 68 cm"],
                ["Packed weight", "2.4 kg"],
                ["SKU", PRODUCT.sku],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-[var(--color-muted)]">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </main>
    </>
  );
}

/** What the shop shows once the money has arrived. */
function Confirmation({
  signature,
  price,
}: {
  signature: string;
  price: string;
}) {
  return (
    <div className="mt-8 rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E8F5EF]">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M4 9.5 7.2 12.6 14 5.8"
              stroke="#0F8B5F"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="text-[15px] font-medium">Order confirmed</p>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-muted)]">
        We&apos;ve received {price} and your chair is on its way. Order{" "}
        <span className="text-[var(--color-ink)]">#1042</span> — delivery in
        3–5 days.
      </p>

      <p className="mt-4 text-[12px] text-[var(--color-muted)]">Payment reference</p>
      <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-[var(--color-muted)]">
        {signature}
      </p>
    </div>
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
