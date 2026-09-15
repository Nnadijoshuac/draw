"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Confirmation, not security. The wallet is already authenticated; this is the
// deliberate pause before money moves, which is the only reason people trust
// tapping a button that spends.
const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function PinSheet({
  open,
  title,
  subtitle,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setPin("");
    else sheetRef.current?.focus();
  }, [open]);

  const press = useCallback(
    (digit: string) => {
      if (busy) return;
      setPin((current) => {
        const next = (current + digit).slice(0, PIN_LENGTH);
        if (next.length === PIN_LENGTH) {
          // Let the last dot paint before the sheet changes underneath.
          setTimeout(() => onConfirm(next), 140);
        }
        return next;
      });
    },
    [busy, onConfirm],
  );

  // A keypad you cannot type into is a keypad that fights the user.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (busy) return;
      if (event.key >= "0" && event.key <= "9") {
        event.preventDefault();
        press(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setPin((p) => p.slice(0, -1));
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, press, onCancel]);

  if (!open) return null;

  return (
    <div
      className="veil fixed inset-0 z-50 flex items-end justify-center bg-[rgb(11_13_18_/_0.28)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-up w-full max-w-[420px] rounded-t-[22px] bg-[var(--color-paper)] px-6 pb-9 pt-5 shadow-[var(--shadow-sheet)] outline-none"
      >
        <div
          aria-hidden
          className="mx-auto mb-5 h-1 w-9 rounded-full bg-[var(--color-line)]"
        />

        <div className="text-center">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-[13px] text-[var(--color-muted)]">{subtitle}</p>
          )}
        </div>

        <div className="mt-7 flex justify-center gap-3.5" aria-live="polite">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`h-[11px] w-[11px] rounded-full transition-all duration-200 ${
                i < pin.length
                  ? "scale-100 bg-[var(--color-accent)]"
                  : "scale-90 bg-[var(--color-line)]"
              }`}
            />
          ))}
        </div>

        <p
          className="mt-4 min-h-[18px] text-center text-[13px] text-[var(--color-danger)]"
          role="alert"
        >
          {busy ? "" : (error ?? "")}
        </p>

        {busy ? (
          <p className="flex h-[248px] items-center justify-center text-[14px] text-[var(--color-muted)]">
            Confirming your payment…
          </p>
        ) : (
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {KEYS.map((d) => (
              <Key key={d} onClick={() => press(d)}>
                {d}
              </Key>
            ))}
            <Key onClick={onCancel} muted>
              Cancel
            </Key>
            <Key onClick={() => press("0")}>0</Key>
            <Key onClick={() => setPin((p) => p.slice(0, -1))} muted>
              Delete
            </Key>
          </div>
        )}
      </div>
    </div>
  );
}

function Key({
  children,
  onClick,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tabular h-[58px] rounded-[var(--radius-control)] transition-colors duration-100 hover:bg-[var(--color-surface)] active:bg-[var(--color-line)] ${
        muted
          ? "text-[13px] text-[var(--color-muted)]"
          : "text-[20px] font-medium"
      }`}
    >
      {children}
    </button>
  );
}
