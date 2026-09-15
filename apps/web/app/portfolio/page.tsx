"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTokenAmount, formatUsd, type Portfolio } from "@draw/shared";
import { useDrawWallet } from "@/lib/useDrawWallet";
import {
  AddressField,
  EMPTY_RECIPIENT,
  type RecipientState,
} from "@/components/AddressField";

// What you own, what you hold, what you owe, and what it costs to get out.
//
// Four separate figures, never netted into one. Holdings minus debt reads as a
// loss to someone whose shares are still entirely theirs, and "you didn't lose
// your shares" is the only thing this product actually promises.
export default function PortfolioPage() {
  const wallet = useDrawWallet();
  const router = useRouter();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [amount, setAmount] = useState("");
  const [elsewhere, setElsewhere] = useState(false);
  const [to, setTo] = useState("");
  const [recipient, setRecipient] = useState<RecipientState>(EMPTY_RECIPIENT);

  const [repaying, setRepaying] = useState(false);
  const [repayError, setRepayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet.address) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/positions?owner=${encodeURIComponent(wallet.address)}`,
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "We couldn't load your shares.");
        return;
      }
      setPortfolio(body as Portfolio);
      setError(null);
    } catch {
      setError("We couldn't reach Draw.");
    } finally {
      setRefreshing(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  // Repay in full. The server reads what is actually owed from chain, so the
  // client never decides the amount.
  const repay = useCallback(async () => {
    if (!wallet.address) return;
    setRepaying(true);
    setRepayError(null);

    try {
      const buildRes = await fetch("/api/repay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: wallet.address }),
      });
      const built = await buildRes.json();
      if (!buildRes.ok) throw new Error(built.error ?? "Could not prepare repayment");

      const signed = await wallet.signTransaction(built.transaction);

      const submitRes = await fetch("/api/tx/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "repay", transaction: signed }),
      });
      const submitted = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitted.error ?? "Repayment failed");

      await load();
    } catch (e) {
      setRepayError(e instanceof Error ? e.message : "Repayment failed");
    } finally {
      setRepaying(false);
    }
  }, [wallet, load]);

  const copyAddress = useCallback(() => {
    if (!wallet.address) return;
    void navigator.clipboard?.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [wallet.address]);

  const available = Number(portfolio?.availableToSpendUsd ?? 0);
  const cash = Number(portfolio?.cashUsd ?? 0);
  const owed = Number(portfolio?.costToCloseUsd ?? 0);
  const shortfall = Number(portfolio?.repayShortfallUsd ?? 0);

  const requested = Number(amount || 0);
  const tooMuch = requested > available;
  const destinationReady = !elsewhere || recipient.address !== null;
  const canDraw = requested > 0 && !tooMuch && destinationReady;

  const startDraw = useCallback(() => {
    const minor = Math.round(requested * 100);
    const target = elsewhere && recipient.address ? recipient.address : null;

    router.push(
      target
        ? `/checkout?amount=${minor}&to=${encodeURIComponent(target)}`
        : `/checkout?amount=${minor}`,
    );
  }, [requested, elsewhere, recipient.address, router]);

  if (!wallet.ready) {
    return (
      <Page>
        <p className="py-24 text-center text-[15px] text-[var(--color-muted)]">
          Loading
        </p>
      </Page>
    );
  }

  if (!wallet.authenticated) {
    return (
      <Page>
        <div className="rise flex min-h-[70vh] flex-col justify-center">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em]">Draw</h1>
          <p className="mt-3 max-w-[28ch] text-[17px] leading-relaxed text-[var(--color-muted)]">
            Pay for things with the shares you already own, without selling them.
          </p>
          <Primary className="mt-9" onClick={wallet.login}>
            Sign in
          </Primary>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <header className="flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Draw</span>
        <button
          type="button"
          onClick={() => void wallet.logout()}
          className="rounded px-1 text-[13px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          Sign out
        </button>
      </header>

      <section className="rise mt-9">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] text-[var(--color-muted)]">Available to draw</p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="rounded px-1 text-[12px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>

        {portfolio ? (
          <p className="amount mt-1.5">{formatUsd(portfolio.availableToSpendUsd)}</p>
        ) : (
          <div
            aria-hidden
            className="mt-3 h-9 w-44 rounded-lg bg-[var(--color-surface)]"
          />
        )}

        {portfolio && (
          <p className="mt-1.5 text-[13px] text-[var(--color-muted)]">
            backed by {formatUsd(portfolio.totalValueUsd)} in shares
          </p>
        )}
      </section>

      {(error || wallet.walletError) && (
        <p
          className="mt-6 rounded-[var(--radius-control)] bg-[rgb(217_45_32_/_0.06)] px-3.5 py-3 text-[14px] leading-relaxed text-[var(--color-danger)]"
          role="alert"
        >
          {error ?? `We couldn't set up your account: ${wallet.walletError}`}
        </p>
      )}

      {/* Draw */}
      <section className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-line)] p-4">
        <label htmlFor="amount" className="text-[13px] text-[var(--color-muted)]">
          Draw an amount
        </label>

        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="text-[24px] font-medium text-[var(--color-muted)]">$</span>
          <input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full bg-transparent text-[24px] font-medium tracking-[-0.02em] outline-none placeholder:font-normal placeholder:text-[var(--color-line)]"
          />
        </div>

        <div className="mt-4 flex gap-2">
          {[20, 40, 100].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              className="rounded-full border border-[var(--color-line)] px-3.5 py-1.5 text-[13px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
            >
              ${preset}
            </button>
          ))}
        </div>

        {tooMuch && (
          <p className="mt-3.5 text-[13px] text-[var(--color-danger)]">
            You can draw up to {formatUsd(String(available))} right now.
          </p>
        )}

        {/* Where it goes. Defaults to the user's own wallet, because that is
            the answer most of the time and typing an address you already own
            is a strange thing to ask of someone. */}
        <div className="mt-5 border-t border-[var(--color-line)] pt-4">
          <div className="flex gap-2">
            <Choice active={!elsewhere} onClick={() => setElsewhere(false)}>
              To my wallet
            </Choice>
            <Choice active={elsewhere} onClick={() => setElsewhere(true)}>
              To another wallet
            </Choice>
          </div>

          {elsewhere && (
            <div className="mt-4">
              <AddressField
                label="Solana wallet address"
                value={to}
                owner={wallet.address}
                onChange={setTo}
                onResolved={setRecipient}
              />
            </div>
          )}
        </div>

        <Primary className="mt-4" disabled={!canDraw} onClick={startDraw}>
          Continue
        </Primary>
      </section>

      {/* Balances */}
      <section className="mt-10">
        <p className="text-[13px] text-[var(--color-muted)]">Your balances</p>

        <div className="mt-3 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {portfolio?.positions.length ? (
            portfolio.positions.map((position) => (
              <div
                key={position.mint}
                className="flex items-baseline justify-between py-4"
              >
                <div>
                  <p className="text-[15px] font-medium">{position.symbol}</p>
                  <p className="tabular mt-0.5 text-[13px] text-[var(--color-muted)]">
                    {formatTokenAmount(position.amount)} at{" "}
                    {formatUsd(position.priceUsd)}
                  </p>
                </div>
                <p className="tabular text-[15px] font-medium">
                  {formatUsd(position.valueUsd)}
                </p>
              </div>
            ))
          ) : (
            <p className="py-7 text-[14px] text-[var(--color-muted)]">
              {portfolio
                ? "No shares yet. Once you hold tokenized stock it appears here."
                : wallet.address
                  ? "Loading"
                  : "Setting up your account"}
            </p>
          )}

          {/* Cash on hand. Only worth a line once it can actually sit here —
              before drawing to your own wallet it never did. */}
          {portfolio && (
            <div className="flex items-baseline justify-between py-4">
              <div>
                <p className="text-[15px] font-medium">Cash</p>
                <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
                  Ready to spend or send
                </p>
              </div>
              <div className="flex items-baseline gap-3">
                <p className="tabular text-[15px] font-medium">
                  {formatUsd(portfolio.cashUsd)}
                </p>
                {cash > 0 && (
                  <button
                    type="button"
                    onClick={() => router.push("/send")}
                    className="rounded px-1 text-[13px] font-medium text-[var(--color-accent)]"
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {portfolio && owed > 0 && (
          <div className="mt-5 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-[var(--color-muted)]">You owe</span>
              <span className="tabular text-[15px] font-medium">
                {formatUsd(portfolio.costToCloseUsd)}
              </span>
            </div>

            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
              Clear this and the shares held as security are released.
            </p>

            {/* The state that would otherwise look broken: money drawn and sent
                somewhere else, so there is a debt and nothing to clear it with. */}
            {shortfall > 0 && (
              <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-paper)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--color-muted)]">
                You&apos;re holding {formatUsd(portfolio.cashUsd)}. Add{" "}
                <span className="tabular font-medium text-[var(--color-ink)]">
                  {formatUsd(portfolio.repayShortfallUsd)}
                </span>{" "}
                more to your wallet to clear it in full.
              </p>
            )}

            {repayError && (
              <p className="mt-3 text-[13px] text-[var(--color-danger)]" role="alert">
                {repayError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void repay()}
              disabled={repaying || shortfall > 0}
              className="mt-3.5 w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-paper)] py-3 text-[14px] font-medium transition-colors hover:border-[var(--color-ink)] disabled:cursor-not-allowed disabled:text-[var(--color-muted)] disabled:hover:border-[var(--color-line)]"
            >
              {repaying
                ? "Repaying"
                : `Repay ${formatUsd(portfolio.costToCloseUsd)}`}
            </button>
          </div>
        )}
      </section>

      {/* Receive */}
      {wallet.address && (
        <section className="mt-10">
          <p className="text-[13px] text-[var(--color-muted)]">
            Your wallet address
          </p>
          <p className="mt-2 break-all font-mono text-[12px] leading-relaxed text-[var(--color-muted)]">
            {wallet.address}
          </p>
          <button
            type="button"
            onClick={copyAddress}
            className="mt-2.5 rounded-[var(--radius-control)] border border-[var(--color-line)] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-[var(--color-ink)]"
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <p className="mt-3 max-w-[40ch] text-[13px] leading-relaxed text-[var(--color-muted)]">
            Send USDC here from any Solana wallet. Only Solana.
          </p>
        </section>
      )}

      <footer className="mt-12 border-t border-[var(--color-line)] pt-5">
        <p className="max-w-[40ch] text-[13px] leading-relaxed text-[var(--color-muted)]">
          Drawing borrows against these shares and holds them as security. You
          keep them.
        </p>
      </footer>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[440px] px-6 pb-16 pt-10">{children}</main>
  );
}

function Choice({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-[var(--radius-control)] border py-2.5 text-[13px] font-medium transition-colors ${
        active
          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function Primary({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-[var(--radius-control)] bg-[var(--color-accent)] py-3.5 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[var(--color-accent-ink)] disabled:cursor-not-allowed disabled:bg-[var(--color-line)] disabled:text-[var(--color-muted)] ${className}`}
    >
      {children}
    </button>
  );
}
