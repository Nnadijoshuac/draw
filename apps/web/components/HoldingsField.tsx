// Ambient field behind the hero.
//
// One line threads every card: shares, the thing they paid for, the merchant's
// confirmation, the receipt. Nothing detaches, which is the argument the
// product is making before anyone reads a word of it.
//
// Blue and white only. The decoration on a card is the card's own data drawn
// small — a rail, a sparkline, a share bar — never ornament for its own sake.
//
// Two arrangements of the same cards. On a wide screen the whole constellation
// is visible and the line is the point. On a phone there is no room for a
// constellation, so four of the cards hang off the left and right edges,
// half-shown — enough to read as a portfolio the copy is sitting inside of,
// without a single card competing with the headline for the middle.
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
  /** Closes for the sparkline, in whatever unit. Only the shape is read. */
  spark?: number[];
  /** 0–1. Fills the rail under a card that is about a portion of something. */
  fill?: number;
  /** Where this card hangs on a phone. Omitted means it sits the phone out. */
  phone?: Phone;
};

type Phone = {
  /** Which edge the card hangs off. */
  side: "left" | "right";
  /**
   * Pixels from that edge. Negative bleeds the card off-screen, which is the
   * whole effect — in px, not percent, so the visible sliver is the same on a
   * 320px phone and a 760px tablet.
   */
  inset: number;
  /** Percent down the field, measured from the top or the bottom edge. */
  offset: number;
  from: "top" | "bottom";
  rotate: number;
  opacity: number;
};

// Ordered as the line visits them: down the left, across the bottom, up the
// right. That keeps the path clear of the copy in the middle.
const CARDS: Card[] = [
  {
    x: 4, y: 9, rotate: -3, opacity: 0.75,
    kind: "holding", title: "SPYx", detail: "12.40 shares", meta: "$9,531.26",
    spark: [12, 14, 13, 16, 15, 18, 17, 20],
  },
  {
    x: 1, y: 42, rotate: 2, opacity: 1,
    kind: "holding", title: "NVDAx", detail: "500.00 shares", meta: "$109,340.69",
    spark: [8, 11, 10, 15, 19, 17, 23, 27],
    phone: { side: "left", inset: -66, offset: 1, from: "top", rotate: -4, opacity: 0.6 },
  },
  {
    x: 6, y: 74, rotate: -1.5, opacity: 0.85,
    kind: "receipt", title: "You still own", detail: "all 0.52 NVDAx",
    fill: 1,
    phone: { side: "left", inset: -72, offset: 2, from: "bottom", rotate: 3, opacity: 0.5 },
  },
  {
    x: 38, y: 86, rotate: 1.5, opacity: 0.5,
    kind: "holding", title: "TSLAx", detail: "3.10 shares", meta: "$1,132.99",
    spark: [18, 16, 17, 14, 15, 13, 14, 12],
  },
  {
    x: 70, y: 72, rotate: 3, opacity: 0.9,
    kind: "paid", title: "Paid", detail: "Kitui Supply Co.", meta: "$40.00",
    phone: { side: "right", inset: -60, offset: 6, from: "bottom", rotate: -3, opacity: 0.65 },
  },
  {
    x: 74, y: 39, rotate: -2, opacity: 1,
    kind: "pay", title: "Kitui Camp Chair", detail: "Pay with Draw", meta: "$40.00",
    fill: 0.04,
    phone: { side: "right", inset: -68, offset: 4, from: "top", rotate: 2.5, opacity: 0.55 },
  },
  {
    x: 71, y: 6, rotate: 2.5, opacity: 0.7,
    kind: "holding", title: "AAPLx", detail: "8.00 shares", meta: "$2,666.72",
    spark: [20, 19, 21, 22, 21, 24, 23, 25],
  },
  {
    x: 36, y: 2, rotate: -1, opacity: 0.45,
    kind: "holding", title: "QQQx", detail: "5.00 shares", meta: "$3,584.85",
    spark: [10, 12, 11, 13, 12, 14, 16, 15],
  },
];

// The card's own centre, roughly, for drawing the line between them.
const NODE_DX = 5.5;
const NODE_DY = 5.5;

/** Nudges the whole field across. One dial rather than eight. */
const SHIFT_X = 4;

/*
 * The field's cues, in milliseconds. The headline in `Hero` opens on its own;
 * the field starts under it and the line closes the sequence, drawing itself
 * through cards that are already there. Nothing arrives at the same time as
 * anything else, which is the whole of what makes it read as a sequence.
 */

/** The field holds until the claim has landed. */
const FIELD_LEAD = 340;

/** Between one card starting and the next. Cards fall in the line's order. */
const STAGGER = 95;

/** The line starts while the last cards are still settling. */
const LINE_DELAY = FIELD_LEAD + (CARDS.length - 1) * STAGGER + 620;

/** Matches `.thread` in globals.css — the nodes are timed against the draw. */
const DRAW_MS = 1500;

export function HoldingsField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <PhoneField />
      <WideField />
    </div>
  );
}

/**
 * Where each node sits along the path, 0 at the first card and 1 at the last,
 * so a node can be timed to the moment the line reaches it. Measured in viewBox
 * units — the viewBox is stretched to the field, so this is an approximation of
 * the on-screen distance, and close enough that nothing looks early or late.
 */
function progressAlong(points: { x: number; y: number }[]) {
  const steps = points.map((p, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1]!;
    return Math.hypot(p.x - prev.x, p.y - prev.y);
  });

  let run = 0;
  const cumulative = steps.map((s) => (run += s));
  const total = run || 1;

  return cumulative.map((c) => c / total);
}

/** The full constellation, threaded. Needs the width to make sense. */
function WideField() {
  const nodes = CARDS.map((card) => ({
    key: card.title,
    opacity: card.opacity,
    x: card.x + SHIFT_X + NODE_DX,
    y: card.y + NODE_DY,
  }));

  const path = nodes
    .map((n, i) => `${i === 0 ? "M" : "L"} ${n.x} ${n.y}`)
    .join(" ");

  const reached = progressAlong(nodes);

  return (
    <div className="absolute inset-0 hidden lg:block">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path
          className="thread"
          style={{ animationDelay: `${LINE_DELAY}ms` }}
          d={path}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pathLength="1"
          strokeDasharray="1"
        />
      </svg>

      {/* The joints of the line, drawn unstretched so they stay round. Each one
          lights as the draw passes through it. */}
      {nodes.map((n, i) => (
        <span
          key={n.key}
          className="veil absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-paper)] ring-1 ring-[var(--color-accent)]/30"
          style={{
            left: `${n.x}%`,
            top: `${n.y}%`,
            opacity: n.opacity,
            animationDelay: `${Math.round(LINE_DELAY + reached[i]! * DRAW_MS)}ms`,
          }}
        />
      ))}

      {CARDS.map((card, i) => (
        <FieldCard
          key={card.title}
          card={card}
          className="w-[176px]"
          rotate={card.rotate}
          delay={FIELD_LEAD + i * STAGGER}
          style={{
            left: `${card.x + SHIFT_X}%`,
            top: `${card.y}%`,
            opacity: card.opacity,
          }}
        />
      ))}
    </div>
  );
}

/** Four cards, half off the edges, out of the copy's way. */
function PhoneField() {
  return (
    <div className="absolute inset-0 lg:hidden">
      {CARDS.filter((card) => card.phone).map((card, i) => {
        const p = card.phone!;
        return (
          <FieldCard
            key={card.title}
            card={card}
            className="w-[158px]"
            rotate={p.rotate}
            delay={FIELD_LEAD + i * STAGGER}
            style={{
              [p.side]: `${p.inset}px`,
              [p.from]: `${p.offset}%`,
              opacity: p.opacity,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Two elements, on purpose. The wrapper owns the position and the fall, the
 * card owns its rotation. On one element the animation's translate and the
 * card's rotate would interpolate as one matrix and every card would twist as
 * it landed.
 */
function FieldCard({
  card,
  className,
  style,
  rotate,
  delay,
}: {
  card: Card;
  className: string;
  style: React.CSSProperties;
  rotate: number;
  delay: number;
}) {
  return (
    <div
      className={`fall absolute ${className}`}
      style={{ ...style, animationDelay: `${delay}ms` }}
    >
      <article
        className="overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--color-paper)] shadow-[var(--shadow-raise)]"
        style={{ transform: `rotate(${rotate}deg)` }}
      >
        {/* Top rail: solid on the card being acted on, fading on the rest. */}
        <span
          className={
            card.kind === "pay" || card.kind === "paid"
              ? "block h-[2px] bg-[var(--color-accent)]"
              : "block h-[2px] bg-gradient-to-r from-[var(--color-accent)]/45 to-transparent"
          }
        />

        <div className="p-3">
          <div className="flex items-center gap-2">
            <Glyph kind={card.kind} />
            <span className="truncate text-[12px] font-medium">{card.title}</span>
            {card.kind === "holding" && <Ticks />}
          </div>

          <p className="mt-1.5 truncate text-[11px] text-[var(--color-muted)]">
            {card.detail}
          </p>

          {card.meta && (
            <p className="tabular mt-1.5 text-[13px] font-medium tracking-[-0.01em]">
              {card.meta}
            </p>
          )}

          {card.spark && <Spark points={card.spark} />}

          {card.fill !== undefined && <FillBar fill={card.fill} />}
        </div>
      </article>
    </div>
  );
}

/** Four hairlines trailing the ticker, like a signal readout. */
function Ticks() {
  return (
    <span className="ml-auto flex shrink-0 items-end gap-[2px]">
      {[4, 7, 5, 9].map((h, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-[var(--color-accent)]/25"
          style={{ height: `${h}px` }}
        />
      ))}
    </span>
  );
}

/**
 * The card's own line, under its own figure. Normalised so a flat series and a
 * steep one both use the full height and neither reads as noise.
 */
function Spark({ points }: { points: number[] }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 20 - ((p - min) / span) * 18 - 1;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="mt-2 h-[20px] w-full"
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
    >
      <path
        d={`${d} L 100 20 L 0 20 Z`}
        fill="var(--color-accent)"
        opacity="0.07"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** How much of the holding the card is talking about. */
function FillBar({ fill }: { fill: number }) {
  return (
    <span className="mt-2.5 block h-[3px] w-full overflow-hidden rounded-full bg-[var(--color-accent-bg)]">
      <span
        className="block h-full rounded-full bg-[var(--color-accent)]"
        style={{ width: `${Math.max(fill, 0.04) * 100}%`, opacity: 0.6 }}
      />
    </span>
  );
}

function Glyph({ kind }: { kind: Card["kind"] }) {
  if (kind === "paid") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
        <svg width="11" height="11" viewBox="0 0 18 18" fill="none">
          <path
            d="M4 9.5 7.2 12.6 14 5.8"
            stroke="var(--color-paper)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (kind === "pay") {
    return <span className="h-4 w-4 shrink-0 rounded-[5px] bg-[var(--color-accent)]" />;
  }

  if (kind === "receipt") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border border-[var(--color-accent)]/40 bg-[var(--color-accent-bg)]">
        <span className="h-[5px] w-[5px] rounded-[1.5px] bg-[var(--color-accent)]/60" />
      </span>
    );
  }

  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-ink)]">
      <span className="h-[4px] w-[4px] rounded-full bg-[var(--color-accent)]" />
    </span>
  );
}
