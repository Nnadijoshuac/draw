// Ambient field behind the hero.
//
// Guild scatters the things their product manages. Ours scatters what you own
// and what it pays for, with hairlines running between them: the shares sit
// still, the payment leaves. That is the argument, made before anyone reads a
// word of it.
//
// Decorative only, and hidden from assistive tech.

type Card = {
  /** Percentages, so the field scales with the hero rather than a fixed canvas. */
  x: number;
  y: number;
  rotate: number;
  opacity: number;
  kind: "holding" | "pay" | "receipt" | "paid";
  title: string;
  detail: string;
  meta?: string;
};

const CARDS: Card[] = [
  {
    x: 2, y: 6, rotate: -3, opacity: 0.5,
    kind: "holding", title: "SPYx", detail: "12.40 shares", meta: "$9,531.26",
  },
  {
    x: 74, y: 2, rotate: 2.5, opacity: 0.42,
    kind: "holding", title: "AAPLx", detail: "8.00 shares", meta: "$2,666.72",
  },
  {
    x: 6, y: 52, rotate: 2, opacity: 1,
    kind: "holding", title: "NVDAx", detail: "500.00 shares", meta: "$109,340.69",
  },
  {
    x: 70, y: 40, rotate: -2, opacity: 1,
    kind: "pay", title: "Kitui Camp Chair", detail: "Pay with Draw", meta: "$40.00",
  },
  {
    x: 78, y: 74, rotate: 3, opacity: 0.85,
    kind: "paid", title: "Paid", detail: "Kitui Supply Co.", meta: "$40.00",
  },
  {
    x: 0, y: 84, rotate: -1.5, opacity: 0.6,
    kind: "receipt", title: "You still own", detail: "all 0.52 NVDAx", meta: "",
  },
];

// Hairlines between the shares and what they paid for.
const LINKS: [number, number][] = [
  [2, 3],
  [3, 4],
  [2, 5],
  [0, 2],
];

export function HoldingsField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {LINKS.map(([from, to]) => {
          const a = CARDS[from];
          const b = CARDS[to];
          if (!a || !b) return null;
          return (
            <line
              key={`${from}-${to}`}
              x1={a.x + 8}
              y1={a.y + 6}
              x2={b.x + 8}
              y2={b.y + 6}
              stroke="var(--color-line)"
              strokeWidth="0.12"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {CARDS.map((card) => (
        <article
          key={card.title + card.x}
          className="absolute w-[228px] rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] p-3.5 shadow-[var(--shadow-raise)]"
          style={{
            left: `${card.x}%`,
            top: `${card.y}%`,
            opacity: card.opacity,
            transform: `rotate(${card.rotate}deg)`,
          }}
        >
          <div className="flex items-center gap-2">
            <Glyph kind={card.kind} />
            <span className="text-[13px] font-medium">{card.title}</span>
          </div>

          <p className="mt-2 text-[12px] text-[var(--color-muted)]">
            {card.detail}
          </p>

          {card.meta && (
            <p className="tabular mt-2 text-[15px] font-medium tracking-[-0.01em]">
              {card.meta}
            </p>
          )}
        </article>
      ))}

      {/* Fade the field out behind the text so the headline always wins. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_46%_52%_at_50%_45%,var(--color-paper)_62%,transparent_100%)]" />
    </div>
  );
}

function Glyph({ kind }: { kind: Card["kind"] }) {
  if (kind === "paid") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-positive-bg)]">
        <svg width="11" height="11" viewBox="0 0 18 18" fill="none">
          <path
            d="M4 9.5 7.2 12.6 14 5.8"
            stroke="var(--color-positive)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (kind === "pay") {
    return (
      <span className="h-5 w-5 rounded-[6px] bg-[var(--color-accent)]" />
    );
  }

  if (kind === "receipt") {
    return (
      <span className="h-5 w-5 rounded-[6px] border border-[var(--color-line)]" />
    );
  }

  return (
    <span className="h-5 w-5 rounded-full border-2 border-[var(--color-ink)]" />
  );
}
