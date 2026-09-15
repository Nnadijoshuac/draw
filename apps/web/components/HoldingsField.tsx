// Ambient field behind the hero.
//
// One line threads every card: shares, the thing they paid for, the merchant's
// confirmation, the receipt. Nothing detaches, which is the argument the
// product is making before anyone reads a word of it.
//
// Static. No state, no listeners, no client bundle.

type Card = {
  /** Percentages of the field, so it composes at any width. */
  x: number;
  y: number;
  rotate: number;
  opacity: number;
  kind: "holding" | "pay" | "receipt" | "paid";
  title: string;
  detail: string;
  meta?: string;
};

// Ordered as the line visits them: down the left, across the bottom, up the
// right. That keeps the path clear of the copy in the middle.
const CARDS: Card[] = [
  {
    x: 4, y: 9, rotate: -3, opacity: 0.75,
    kind: "holding", title: "SPYx", detail: "12.40 shares", meta: "$9,531.26",
  },
  {
    x: 1, y: 42, rotate: 2, opacity: 1,
    kind: "holding", title: "NVDAx", detail: "500.00 shares", meta: "$109,340.69",
  },
  {
    x: 6, y: 74, rotate: -1.5, opacity: 0.85,
    kind: "receipt", title: "You still own", detail: "all 0.52 NVDAx",
  },
  {
    x: 38, y: 86, rotate: 1.5, opacity: 0.5,
    kind: "holding", title: "TSLAx", detail: "3.10 shares", meta: "$1,132.99",
  },
  {
    x: 70, y: 72, rotate: 3, opacity: 0.9,
    kind: "paid", title: "Paid", detail: "Kitui Supply Co.", meta: "$40.00",
  },
  {
    x: 74, y: 39, rotate: -2, opacity: 1,
    kind: "pay", title: "Kitui Camp Chair", detail: "Pay with Draw", meta: "$40.00",
  },
  {
    x: 71, y: 6, rotate: 2.5, opacity: 0.7,
    kind: "holding", title: "AAPLx", detail: "8.00 shares", meta: "$2,666.72",
  },
  {
    x: 36, y: 2, rotate: -1, opacity: 0.45,
    kind: "holding", title: "QQQx", detail: "5.00 shares", meta: "$3,584.85",
  },
];

// The card's own centre, roughly, for drawing the line between them.
const NODE_DX = 5.5;
const NODE_DY = 5.5;

export function HoldingsField() {
  const path = CARDS.map(
    (card, i) => `${i === 0 ? "M" : "L"} ${card.x + NODE_DX} ${card.y + NODE_DY}`,
  ).join(" ");

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
        <path
          d={path}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {CARDS.map((card) => (
        <article
          key={card.title}
          className="absolute w-[176px] rounded-[12px] border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-[var(--shadow-raise)]"
          style={{
            left: `${card.x}%`,
            top: `${card.y}%`,
            opacity: card.opacity,
            transform: `rotate(${card.rotate}deg)`,
          }}
        >
          <div className="flex items-center gap-2">
            <Glyph kind={card.kind} />
            <span className="text-[12px] font-medium">{card.title}</span>
          </div>

          <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">{card.detail}</p>

          {card.meta && (
            <p className="tabular mt-1.5 text-[13px] font-medium tracking-[-0.01em]">
              {card.meta}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function Glyph({ kind }: { kind: Card["kind"] }) {
  if (kind === "paid") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-positive-bg)]">
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
    return <span className="h-4 w-4 rounded-[5px] bg-[var(--color-accent)]" />;
  }

  if (kind === "receipt") {
    return <span className="h-4 w-4 rounded-[5px] border border-[var(--color-line)]" />;
  }

  return <span className="h-4 w-4 rounded-full border-2 border-[var(--color-ink)]" />;
}
