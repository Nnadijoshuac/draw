"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatUsd, type Portfolio } from "@draw/shared";
import { useDrawWallet } from "@/lib/useDrawWallet";
import { PinSheet } from "@/components/PinSheet";
import {
  AddressField,
  EMPTY_RECIPIENT,
  shortAddress,
  type RecipientState,
} from "@/components/AddressField";

// Moving money the user already holds. No collateral, no borrowing, no risk
// policy — none of it applies to their own balance.
//
// This exists because drawing to your own wallet is pointless if the money
// cannot leave it again.

type Phase = "ready" | "pin" | "sending" | "sent" | "failed";

export default function SendPage() {
  return (
    <Suspense fallback={<Shell><Centered>Loading</Centered></Shell>}>
      <Send />
    </Suspense>
  );
}

function Send() {
  const wallet = useDrawWallet();
  const router = useRouter();
  const params = useSearchParams();

  const [to, setTo] = useState(params.get("to") ?? "");
  const [recipient, setRecipient] = useState<RecipientState>(EMPTY_RECIPIENT);
  const [amount, setAmount] = useState("");
  const [cash, setCash] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // What is actually available to send.
  useEffect(() => {
    if (!wallet.address) return;
    let cancelled = false;

    void fetch(`/api/positions?owner=${encodeURIComponent(wallet.address)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: Portfolio | null) => {
        if (!cancelled && body) setCash(body.cashUsd);
      })
      .catch(() => {
        /* the balance is guidance; the server re-reads it before sending */
      });

    return () => {
      cancelled = true;
    };
  }, [wallet.address]);

  const available = Number(cash ?? 0);
  const requested = Number(amount || 0);
  const tooMuch = requested > available;
  const ready =
    requested > 0 && !tooMuch && recipient.address !== null && !recipient.checking;

  const send = useCallback(async () => {
    if (!wallet.address || !recipient.address) return;

    setPhase("sending");
    setError(null);

    try {
      const buildRes = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner: wallet.address,
          to: recipient.address,
          amountMinor: Math.round(requested * 100),
        }),
      });
      const built = await buildRes.json();
      if (!buildRes.ok) throw new Error(built.error ?? "Could not prepare that transfer");

      const signed = await wallet.signTransaction(built.transaction);

      const submitRes = await fetch("/api/tx/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "send", transaction: signed }),
      });
      const submitted = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitted.error ?? "That transfer failed");

      setSignature(submitted.signature);
      setPhase("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That transfer failed");
      setPhase("failed");
    }
  }, [wallet, recipient.address, requested]);

  if (!wallet.ready) {
    return <Shell><Centered>Loading</Centered></Shell>;
  }

  if (!wallet.authenticated) {
    router.replace("/portfolio");
    return <Shell><Centered>Loading</Centered></Shell>;
  }

  if (phase === "sent") {
    return (
      <Shell>
        <div className="rise flex-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-positive-bg)]">
            <Tick />
          </span>

          <p className="mt-6 text-[13px] text-[var(--color-muted)]">Sent</p>
          <p className="amount mt-1">{formatUsd(String(requested))}</p>

          <p className="mt-6 text-[15px] leading-relaxed text-[var(--color-muted)]">
            to{" "}
            <span className="font-mono text-[var(--color-ink)]">
              {recipient.address ? shortAddress(recipient.address) : ""}
            </span>
          </p>

          {signature && (
            <div className="mt-7">
              <p className="text-[12px] text-[var(--color-muted)]">Transaction</p>
              <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-[var(--color-muted)]">
                {signature}
              </p>
            </div>
          )}
        </div>

        <Primary onClick={() => router.push("/portfolio")}>Done</Primary>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/portfolio")}
          className="rounded text-[13px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          Back
        </button>
        <span className="text-[13px] text-[var(--color-muted)]">Send</span>
      </header>

      <div className="rise mt-8 flex-1">
        <label htmlFor="amount" className="text-[13px] text-[var(--color-muted)]">
          Amount
        </label>

        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[34px] font-semibold tracking-[-0.03em] text-[var(--color-muted)]">
            $
          </span>
          <input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full bg-transparent text-[34px] font-semibold tracking-[-0.03em] outline-none placeholder:font-normal placeholder:text-[var(--color-line)]"
          />
        </div>

        <div className="mt-2.5 flex items-baseline justify-between">
          <p className="text-[13px] text-[var(--color-muted)]">
            {cash === null ? "Checking your balance" : `${formatUsd(cash)} available`}
          </p>
          {available > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(available))}
              className="rounded px-1 text-[13px] font-medium text-[var(--color-accent)]"
            >
              Send all
            </button>
          )}
        </div>

        {tooMuch && (
          <p className="mt-2 text-[13px] text-[var(--color-danger)]">
            You have {formatUsd(String(available))} to send.
          </p>
        )}

        <div className="mt-8">
          <AddressField
            label="To"
            value={to}
            owner={wallet.address}
            onChange={setTo}
            onResolved={setRecipient}
          />
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
          Solana wallets only. A transfer can&apos;t be reversed, so check the
          address before you confirm.
        </p>

        {error && (
          <p
            className="mt-6 rounded-[var(--radius-control)] bg-[rgb(217_45_32_/_0.06)] px-3.5 py-3 text-[14px] leading-relaxed text-[var(--color-danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      <Primary onClick={() => setPhase("pin")} disabled={!ready}>
        {requested > 0 ? `Send ${formatUsd(String(requested))}` : "Send"}
      </Primary>

      <PinSheet
        open={phase === "pin" || phase === "sending"}
        title={`Send ${formatUsd(String(requested))}`}
        subtitle={recipient.address ? `to ${shortAddress(recipient.address)}` : undefined}
        busy={phase === "sending"}
        error={null}
        onConfirm={send}
        onCancel={() => setPhase("ready")}
      />
    </Shell>
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
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-6 pb-7 pt-9">
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
