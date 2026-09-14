"use client";

import { useCallback, useEffect, useState } from "react";

// Confirmation, not security. The wallet is already authenticated; this is the
// deliberate pause before money moves, which is the only reason people trust
// tapping a button that spends.
const PIN_LENGTH = 4;

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

  useEffect(() => {
    if (!open) setPin("");
  }, [open]);

  const press = useCallback(
    (digit: string) => {
      if (busy) return;
      setPin((current) => {
        const next = (current + digit).slice(0, PIN_LENGTH);
        if (next.length === PIN_LENGTH) {
          // Let the last dot paint before the sheet changes under them.
          setTimeout(() => onConfirm(next), 120);
        }
        return next;
      });
    },
    [busy, onConfirm],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20">
      <div className="w-full max-w-[420px] rounded-t-[20px] bg-[var(--color-paper)] px-6 pb-8 pt-6">
        <div className="text-center">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-[13px] text-[var(--color-muted)]">{subtitle}</p>
          )}
        </div>

        <div className="mt-6 flex justify-center gap-3">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition-colors ${
                i < pin.length
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-line)]"
              }`}
            />
          ))}
        </div>

        <p
          className="mt-4 min-h-[18px] text-center text-[13px] text-[var(--color-danger)]"
          role="alert"
        >
          {error ?? ""}
        </p>

        <div className="mt-2 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Key key={d} onClick={() => press(d)} disabled={busy}>
              {d}
            </Key>
          ))}
          <Key onClick={onCancel} disabled={busy} muted>
            Cancel
          </Key>
          <Key onClick={() => press("0")} disabled={busy}>
            0
          </Key>
          <Key
            onClick={() => setPin((p) => p.slice(0, -1))}
            disabled={busy}
            muted
          >
            Back
          </Key>
        </div>

        {busy && (
          <p className="mt-5 text-center text-[13px] text-[var(--color-muted)]">
            Confirming…
          </p>
        )}
      </div>
    </div>
  );
}

function Key({
  children,
  onClick,
  disabled,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-14 rounded-[var(--radius-control)] text-[19px] tabular transition-colors active:bg-[var(--color-surface)] disabled:opacity-40 ${
        muted ? "text-[13px] text-[var(--color-muted)]" : "font-medium"
      }`}
    >
      {children}
    </button>
  );
}
