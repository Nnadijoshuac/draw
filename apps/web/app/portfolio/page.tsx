"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTokenAmount, formatUsd, type Portfolio } from "@draw/shared";
import { useDrawWallet } from "@/lib/useDrawWallet";

// What you hold, and what you can spend against it. The headline figure is
// what Draw will actually lend, well under what the protocol would allow,
// because showing a number we would refuse to honour is worse than useless.
export default function PortfolioPage() {
  const wallet = useDrawWallet();
  const router = useRouter();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("");

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

  const copyAddress = useCallback(() => {
    if (!wallet.address) return;
    void navigator.clipboard?.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [wallet.address]);

  const available = Number(portfolio?.availableToSpendUsd ?? 0);
  const requested = Number(amount || 0);
  const tooMuch = requested > available;
  const canPay = requested > 0 && !tooMuch;

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
          <p className="text-[13px] text-[var(--color-muted)]">Available to spend</p>
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

      {/* Spend */}
      <section className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-line)] p-4">
        <label htmlFor="amount" className="text-[13px] text-[var(--color-muted)]">
          Pay an amount
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
            You can spend up to {formatUsd(String(available))} right now.
          </p>
        )}

        <Primary
          className="mt-4"
          disabled={!canPay}
          onClick={() =>
            router.push(`/checkout?amount=${Math.round(requested * 100)}`)
          }
        >
          Continue
        </Primary>
      </section>

      {/* Holdings */}
      <section className="mt-10">
        <p className="text-[13px] text-[var(--color-muted)]">Your shares</p>

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
        </div>

        {portfolio && Number(portfolio.debtUsd) > 0 && (
          <div className="mt-4 flex items-baseline justify-between text-[13px]">
            <span className="text-[var(--color-muted)]">Borrowed</span>
            <span className="tabular font-medium">
              {formatUsd(portfolio.debtUsd)}
            </span>
          </div>
        )}
      </section>

      <footer className="mt-12 border-t border-[var(--color-line)] pt-5">
        <p className="max-w-[40ch] text-[13px] leading-relaxed text-[var(--color-muted)]">
          Paying with Draw borrows against these shares and holds them as
          security. You keep them.
        </p>

        {wallet.address && (
          <button
            type="button"
            onClick={copyAddress}
            className="mt-3 block max-w-full truncate rounded text-left font-mono text-[11px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
          >
            {copied ? "Copied to clipboard" : wallet.address}
          </button>
        )}
      </footer>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[440px] px-6 pb-16 pt-10">{children}</main>
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
