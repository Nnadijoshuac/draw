"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatMinor, formatPercent, formatTokenAmount, formatUsd, type Quote } from "@draw/shared";
import { useDrawWallet } from "@/lib/useDrawWallet";
import { PinSheet } from "@/components/PinSheet";

// The product. A merchant opens this in a popup, the user confirms, and one
// transaction deposits collateral, borrows against it and pays the merchant.
//
// Amount comes from the query string rather than a session lookup so the
// checkout works with nothing but the embed — fewer moving parts between a
// click and a payment.

type Phase = "loading" | "ready" | "pin" | "signing" | "paid" | "failed";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Shell><Centered>Loading…</Centered></Shell>}>
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const params = useSearchParams();
  const wallet = useDrawWallet();

  const amountMinor = Number(params.get("amount") ?? 0);
  const merchantOrigin = params.get("origin");
  const reference = params.get("reference") ?? undefined;

  const [phase, setPhase] = useState<Phase>("loading");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Who is being paid, so the user sees a shop name rather than an address.
  useEffect(() => {
    if (!merchantOrigin) return;

    let cancelled = false;
    void fetch(`/api/merchant?origin=${encodeURIComponent(merchantOrigin)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body?.name) setMerchantName(body.name as string);
      })
      .catch(() => {
        /* the name is a nicety; the payment does not depend on it */
      });

    return () => {
      cancelled = true;
    };
  }, [merchantOrigin]);

  // Price the draw as soon as we know who is paying.
  useEffect(() => {
    if (!wallet.ready || !wallet.authenticated || !wallet.address) return;
    if (!amountMinor) return;

    let cancelled = false;

    (async () => {
      setPhase("loading");
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: reference ?? "checkout",
            owner: wallet.address,
            amountMinor,
          }),
        });
        const body = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(body.error ?? "We couldn't price that payment.");
          setPhase("failed");
          return;
        }

        setQuote(body as Quote);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setError("We couldn't reach Draw. Check your connection.");
          setPhase("failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet.ready, wallet.authenticated, wallet.address, amountMinor, reference]);

  const pay = useCallback(async () => {
    if (!wallet.address || !quote) return;

    setPhase("signing");
    setError(null);

    try {
      const buildRes = await fetch("/api/tx/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: reference ?? "checkout",
          owner: wallet.address,
          amountMinor,
          origin: merchantOrigin ?? undefined,
          // Opened directly rather than from a shop: pay yourself so the flow
          // can still be exercised in development.
          selfPay: !merchantOrigin,
        }),
      });
      const built = await buildRes.json();
      if (!buildRes.ok) throw new Error(built.error ?? "Could not prepare payment");

      // The server reprices when it builds, so the receipt must show that
      // quote rather than the one we displayed a moment earlier.
      if (built.quote) setQuote(built.quote as Quote);

      const signed = await wallet.signTransaction(built.transaction);

      const submitRes = await fetch("/api/tx/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: reference ?? "checkout",
          transaction: signed,
        }),
      });
      const submitted = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitted.error ?? "Payment failed");

      setSignature(submitted.signature);
      setPhase("paid");

      // Tell the merchant page. Exact origin only — a wildcard would hand the
      // result to any page listening.
      if (merchantOrigin && window.opener) {
        window.opener.postMessage(
          {
            source: "draw",
            sessionId: reference ?? "checkout",
            status: "paid",
            signature: submitted.signature,
          },
          merchantOrigin,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setPhase("failed");
    }
  }, [wallet, quote, amountMinor, reference, merchantOrigin, params]);

  const cancel = useCallback(() => {
    if (merchantOrigin && window.opener) {
      window.opener.postMessage(
        { source: "draw", sessionId: reference ?? "checkout", status: "cancelled" },
        merchantOrigin,
      );
    }
    window.close();
  }, [merchantOrigin, reference]);

  if (!amountMinor) {
    return <Shell><Centered>No amount to pay.</Centered></Shell>;
  }

  if (!wallet.ready) {
    return <Shell><Centered>Loading…</Centered></Shell>;
  }

  if (!wallet.authenticated) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[13px] text-[var(--color-muted)]">
            {merchantName ? `Paying ${merchantName}` : "Paying"}
          </p>
          <p className="amount mt-1">{formatMinor(amountMinor)}</p>
          <p className="mt-6 text-[15px] text-[var(--color-muted)]">
            Sign in to pay with the shares you already own.
          </p>
        </div>
        <PrimaryButton onClick={wallet.login}>Continue</PrimaryButton>
      </Shell>
    );
  }

  if (phase === "paid" && quote) {
    return <Receipt amountMinor={amountMinor} quote={quote} signature={signature} onDone={cancel} />;
  }

  return (
    <Shell>
      <div className="flex-1">
        <p className="text-[13px] text-[var(--color-muted)]">Paying</p>
        <p className="amount mt-1">{formatMinor(amountMinor)}</p>

        {phase === "loading" && (
          <p className="mt-8 text-[15px] text-[var(--color-muted)]">
            Checking what you can spend…
          </p>
        )}

        {quote && phase !== "loading" && (
          <div className="mt-8 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4">
            <Row
              label="Funded by"
              value={`${formatTokenAmount(quote.collateral.amountRequired)} ${quote.collateral.symbol}`}
            />
            <Row label="Interest" value={`${formatPercent(quote.borrow.aprPercent)} APR`} />
            <Row label="Network fee" value="Free" />

            <p className="mt-4 border-t border-[var(--color-line)] pt-4 text-[13px] leading-relaxed text-[var(--color-muted)]">
              You keep every share. Part of your position may be sold if{" "}
              {quote.collateral.symbol} falls below{" "}
              <span className="tabular text-[var(--color-ink)]">
                {formatUsd(quote.after.liquidationPriceUsd)}
              </span>
              .
            </p>
          </div>
        )}

        {error && (
          <p className="mt-6 text-[14px] text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}
      </div>

      <PrimaryButton
        onClick={() => setPhase("pin")}
        disabled={phase !== "ready"}
      >
        {phase === "signing" ? "Paying…" : `Pay ${formatMinor(amountMinor)}`}
      </PrimaryButton>

      <button
        type="button"
        onClick={cancel}
        className="mt-3 w-full py-2 text-[13px] text-[var(--color-muted)]"
      >
        Cancel
      </button>

      <PinSheet
        open={phase === "pin" || phase === "signing"}
        title={`Confirm ${formatMinor(amountMinor)}`}
        subtitle="Enter your PIN"
        busy={phase === "signing"}
        error={null}
        onConfirm={pay}
        onCancel={() => setPhase("ready")}
      />
    </Shell>
  );
}

function Receipt({
  amountMinor,
  quote,
  signature,
  onDone,
}: {
  amountMinor: number;
  quote: Quote;
  signature: string | null;
  onDone: () => void;
}) {
  return (
    <Shell>
      <div className="flex-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-positive)]/10">
          <span className="text-[var(--color-positive)]">✓</span>
        </div>

        <p className="mt-5 text-[13px] text-[var(--color-muted)]">Paid</p>
        <p className="amount mt-1">{formatMinor(amountMinor)}</p>

        {/* The whole product, in one line. */}
        <p className="mt-6 text-[17px] font-medium leading-snug">
          You still own all{" "}
          {formatTokenAmount(quote.collateral.amountRequired)}{" "}
          {quote.collateral.symbol} you put up.
        </p>

        <div className="mt-6 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4">
          <Row label="Borrowed" value={formatMinor(amountMinor)} />
          <Row label="Against" value={quote.collateral.symbol} />
          <Row label="Network fee" value="Free" />
        </div>

        {signature && (
          <p className="mt-4 break-all font-mono text-[11px] text-[var(--color-muted)]">
            {signature}
          </p>
        )}
      </div>

      <PrimaryButton onClick={onDone}>Done</PrimaryButton>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col px-6 py-8">
      {children}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center text-[15px] text-[var(--color-muted)]">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-[13px] text-[var(--color-muted)]">{label}</span>
      <span className="tabular text-[14px]">{value}</span>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-[var(--radius-control)] bg-[var(--color-accent)] py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-[var(--color-accent-ink)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

