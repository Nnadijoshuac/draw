"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  formatMinor,
  formatPercent,
  formatTokenAmount,
  formatUsd,
  type Quote,
} from "@draw/shared";
import { useDrawWallet } from "@/lib/useDrawWallet";
import { PinSheet } from "@/components/PinSheet";
import { shortAddress } from "@/components/AddressField";

// The product. One transaction deposits collateral, borrows against it, and
// sends the money where it is going.
//
// Three destinations, one screen. `origin` means a merchant opened this in a
// popup and the payee is resolved server side from that origin. `to` means the
// user started the draw themselves and named a wallet. Neither means they are
// keeping it.
//
// Amount comes from the query string rather than a session lookup so the
// checkout works with nothing but the embed: fewer moving parts between a
// click and a payment.

type Phase = "loading" | "ready" | "pin" | "signing" | "paid" | "failed";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Shell><Centered>Loading</Centered></Shell>}>
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const params = useSearchParams();
  const router = useRouter();
  const wallet = useDrawWallet();

  const amountMinor = Number(params.get("amount") ?? 0);
  const merchantOrigin = params.get("origin");
  const reference = params.get("reference") ?? undefined;
  // Only honoured when there is no merchant origin. The server enforces that;
  // this is just what we show.
  const to = merchantOrigin ? null : params.get("to");

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
          // Ignored when an origin is present. Omitted entirely, the money
          // stays with the user.
          to: to ?? undefined,
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

      // Tell the merchant page. Exact origin only; a wildcard would hand the
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
  }, [wallet, quote, amountMinor, reference, merchantOrigin, to]);

  // A merchant checkout is a popup and closing it is the whole exit. A draw the
  // user started themselves is an ordinary page, and window.close() does
  // nothing to a tab the script did not open — so it goes back to where it
  // came from instead.
  const close = useCallback(() => {
    if (merchantOrigin && window.opener) {
      window.close();
      return;
    }
    router.push("/portfolio");
  }, [merchantOrigin, router]);

  const cancel = useCallback(() => {
    if (merchantOrigin && window.opener) {
      window.opener.postMessage(
        { source: "draw", sessionId: reference ?? "checkout", status: "cancelled" },
        merchantOrigin,
      );
    }
    close();
  }, [merchantOrigin, reference, close]);

  if (!amountMinor) {
    return <Shell><Centered>There is no amount to pay.</Centered></Shell>;
  }

  if (!wallet.ready) {
    return <Shell><Centered>Loading</Centered></Shell>;
  }

  if (!wallet.authenticated) {
    return (
      <Shell>
        <div className="rise flex flex-1 flex-col justify-center">
          <Destination name={merchantName} to={to} />
          <p className="amount amount-lg mt-2">{formatMinor(amountMinor)}</p>
          <p className="mt-7 max-w-[30ch] text-[15px] leading-relaxed text-[var(--color-muted)]">
            Sign in to pay with shares you already own. You keep every one.
          </p>
        </div>
        <Primary onClick={wallet.login}>Continue</Primary>
      </Shell>
    );
  }

  if (phase === "paid" && quote) {
    return (
      <Receipt
        amountMinor={amountMinor}
        merchantName={merchantName}
        to={to}
        quote={quote}
        signature={signature}
        onDone={close}
      />
    );
  }

  const pricing = phase === "loading";

  return (
    <Shell>
      <div className="rise flex-1">
        <Destination name={merchantName} to={to} />
        <p className="amount amount-lg mt-2">{formatMinor(amountMinor)}</p>

        {/* The address in full, before the PIN. A transfer is final and a
            shortened address hides exactly the characters a typo changes. */}
        {to && (
          <div className="mt-7 rounded-[var(--radius-card)] border border-[var(--color-line)] p-4">
            <p className="text-[13px] text-[var(--color-muted)]">Going to</p>
            <p className="mt-1.5 break-all font-mono text-[13px] leading-relaxed">
              {to}
            </p>
          </div>
        )}

        <div className="mt-8">
          {pricing ? (
            <QuoteSkeleton />
          ) : quote ? (
            <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4">
              <Row
                label="Funded by"
                value={`${formatTokenAmount(quote.collateral.amountRequired)} ${quote.collateral.symbol}`}
              />
              <Row label="Interest" value={`${formatPercent(quote.borrow.aprPercent)} a year`} />
              <Row label="Network fee" value="Free" />

              <p className="mt-4 border-t border-[var(--color-line)] pt-4 text-[13px] leading-relaxed text-[var(--color-muted)]">
                Your shares are held as security, not sold. Some may be sold only
                if {quote.collateral.symbol} falls below{" "}
                <span className="tabular font-medium text-[var(--color-ink)]">
                  {formatUsd(quote.after.liquidationPriceUsd)}
                </span>
                .
              </p>
            </div>
          ) : null}
        </div>

        {error && (
          <p
            className="mt-6 rounded-[var(--radius-control)] bg-[rgb(217_45_32_/_0.06)] px-3.5 py-3 text-[14px] leading-relaxed text-[var(--color-danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      <Primary onClick={() => setPhase("pin")} disabled={phase !== "ready"}>
        {pricing
          ? "Checking what you can spend"
          : `${merchantName ? "Pay" : "Draw"} ${formatMinor(amountMinor)}`}
      </Primary>

      <button
        type="button"
        onClick={cancel}
        className="mt-2 w-full rounded-[var(--radius-control)] py-2.5 text-[13px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        Cancel
      </button>

      <PinSheet
        open={phase === "pin" || phase === "signing"}
        title={`Confirm ${formatMinor(amountMinor)}`}
        // The destination is the thing worth checking twice, so it goes here
        // rather than a generic instruction to enter a PIN.
        subtitle={
          merchantName
            ? `to ${merchantName}`
            : to
              ? `to ${shortAddress(to)}`
              : "to your wallet"
        }
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
  merchantName,
  to,
  quote,
  signature,
  onDone,
}: {
  amountMinor: number;
  merchantName: string | null;
  to: string | null;
  quote: Quote;
  signature: string | null;
  onDone: () => void;
}) {
  const headline = merchantName
    ? `Paid ${merchantName}`
    : to
      ? `Sent to ${shortAddress(to)}`
      : "Drawn to your wallet";
  return (
    <Shell>
      <div className="rise flex-1">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-positive-bg)]">
          <Tick />
        </span>

        <p className="mt-6 text-[13px] text-[var(--color-muted)]">{headline}</p>
        <p className="amount amount-lg mt-1">{formatMinor(amountMinor)}</p>

        {/* The whole product, in one line. */}
        <p className="mt-7 max-w-[26ch] text-[19px] font-medium leading-snug tracking-[-0.01em]">
          You still own all{" "}
          <span className="tabular">
            {formatTokenAmount(quote.collateral.amountRequired)}
          </span>{" "}
          {quote.collateral.symbol} you put up.
        </p>

        <div className="mt-7 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4">
          <Row label="Borrowed" value={formatMinor(amountMinor)} />
          <Row label="Held as security" value={quote.collateral.symbol} />
          <Row label="Network fee" value="Free" />
          <p className="mt-3.5 border-t border-[var(--color-line)] pt-3.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
            You owe {formatMinor(amountMinor)}. Repay it and the{" "}
            {quote.collateral.symbol} comes back to you.
          </p>
        </div>

        {signature && (
          <div className="mt-5">
            <p className="text-[12px] text-[var(--color-muted)]">Transaction</p>
            <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-[var(--color-muted)]">
              {signature}
            </p>
          </div>
        )}
      </div>

      <Primary onClick={onDone}>Done</Primary>
    </Shell>
  );
}

/**
 * Where the money is going, in the user's words.
 *
 * A merchant gets a name because the user recognises it. A wallet gets a
 * shortened address because there is nothing else honest to call it, and the
 * full address is shown again on the confirmation before they sign.
 */
function Destination({ name, to }: { name: string | null; to: string | null }) {
  const label = name
    ? `Paying ${name}`
    : to
      ? `Drawing to ${shortAddress(to)}`
      : "Drawing to your wallet";

  return <p className="text-[13px] text-[var(--color-muted)]">{label}</p>;
}

function QuoteSkeleton() {
  return (
    <div
      className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4"
      aria-hidden
    >
      {[68, 54, 46].map((width, i) => (
        <div key={i} className="flex items-center justify-between py-2">
          <span
            className="h-3 rounded-full bg-[var(--color-line)]"
            style={{ width: `${width}px` }}
          />
          <span
            className="h-3 rounded-full bg-[var(--color-line)]"
            style={{ width: `${width + 24}px` }}
          />
        </div>
      ))}
    </div>
  );
}

function Tick() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M4 9.5 7.2 12.6 14 5.8"
        stroke="var(--color-positive)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col px-6 pb-7 pt-9">
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
      <span className="tabular text-[14px] font-medium">{value}</span>
    </div>
  );
}

function Primary({
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
      className="w-full rounded-[var(--radius-control)] bg-[var(--color-accent)] py-3.5 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[var(--color-accent-ink)] disabled:cursor-not-allowed disabled:bg-[var(--color-line)] disabled:text-[var(--color-muted)]"
    >
      {children}
    </button>
  );
}
