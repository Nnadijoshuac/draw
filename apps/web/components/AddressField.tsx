"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A Solana address input that checks the chain before money moves.
 *
 * The check is debounced and runs while typing, but the result is advisory in
 * one direction only: a wallet with no history yet warns and still lets you
 * through, while a token account or a program address is refused outright.
 * Those two are where people actually lose money.
 */

export interface RecipientState {
  address: string | null;
  checking: boolean;
  error: string | null;
  warning: string | null;
}

export const EMPTY_RECIPIENT: RecipientState = {
  address: null,
  checking: false,
  error: null,
  warning: null,
};

export function AddressField({
  label,
  value,
  owner,
  onChange,
  onResolved,
  placeholder = "Solana wallet address",
}: {
  label: string;
  value: string;
  /** The sender, so we can tell them when they have pasted their own address. */
  owner: string | null;
  onChange: (value: string) => void;
  onResolved: (state: RecipientState) => void;
  placeholder?: string;
}) {
  const [state, setState] = useState<RecipientState>(EMPTY_RECIPIENT);

  // Held in a ref so a parent that passes a new closure every render does not
  // restart the debounce. Assigned in an effect rather than during render,
  // because a render can be discarded and a ref written during one cannot.
  const report = useRef(onResolved);
  useEffect(() => {
    report.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    const trimmed = value.trim();

    if (!trimmed) {
      setState(EMPTY_RECIPIENT);
      report.current(EMPTY_RECIPIENT);
      return;
    }

    // Too short to be an address yet. Saying so while someone is halfway
    // through pasting is just noise.
    if (trimmed.length < 32) {
      const partial = { ...EMPTY_RECIPIENT, checking: true };
      setState(partial);
      report.current(partial);
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, checking: true }));

    const timer = setTimeout(() => {
      const query = new URLSearchParams({ address: trimmed });
      if (owner) query.set("owner", owner);

      void fetch(`/api/recipient?${query}`)
        .then((res) => res.json())
        .then((body) => {
          if (cancelled) return;

          const next: RecipientState = body.ok
            ? {
                address: body.address as string,
                checking: false,
                error: null,
                warning: (body.warning as string | null) ?? null,
              }
            : {
                address: null,
                checking: false,
                error: (body.message as string) ?? "We can't send to that address.",
                warning: null,
              };

          setState(next);
          report.current(next);
        })
        .catch(() => {
          if (cancelled) return;
          const next = {
            ...EMPTY_RECIPIENT,
            error: "We couldn't check that address.",
          };
          setState(next);
          report.current(next);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, owner]);

  const tone = state.error
    ? "border-[var(--color-danger)]"
    : state.warning
      ? "border-[#B54708]"
      : "border-[var(--color-line)]";

  return (
    <div>
      <label htmlFor="recipient" className="text-[13px] text-[var(--color-muted)]">
        {label}
      </label>

      <input
        id="recipient"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={`mt-2 w-full rounded-[var(--radius-control)] border bg-transparent px-3.5 py-3 font-mono text-[13px] outline-none transition-colors placeholder:font-sans placeholder:text-[var(--color-muted)] focus:border-[var(--color-ink)] ${tone}`}
      />

      <p className="mt-2 min-h-[18px] text-[13px] leading-snug" role="status">
        {state.checking ? (
          <span className="text-[var(--color-muted)]">Checking</span>
        ) : state.error ? (
          <span className="text-[var(--color-danger)]">{state.error}</span>
        ) : state.warning ? (
          <span className="text-[#B54708]">{state.warning}</span>
        ) : null}
      </p>
    </div>
  );
}

/** Shorten an address for display. Both ends, because both ends matter. */
export function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}
