"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The cursor draws. The product is called Draw, so the closing section lets you
// do exactly that.
//
// The taper runs along the stroke rather than over time. Fading each segment on
// its own timer looked like the whole line blinking out at once, because a
// stroke drawn in half a second leaves every segment the same age. Here the
// head is always thick and solid, the tail always thin and faint, and the trail
// drains continuously from the back — so the fade travels with the hand.

/** Segments kept behind the cursor. Sets how long the tail looks. */
const TRAIL = 160;
/** How long a finished stroke takes to drain away completely. */
const LIFETIME_MS = 6000;
/** Retiring one segment at a time spreads that lifetime along the trail. */
const DRAIN_MS = LIFETIME_MS / TRAIL;
/** Ignore jitter; a new segment only starts once the pen has really moved. */
const MIN_STEP = 4;

const HEAD_WIDTH = 7;
const TAIL_WIDTH = 0.5;

type Segment = { id: number; d: string };
type Point = { x: number; y: number };

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export function InkTrail({
  children,
  className = "",
}: {
  children: React.ReactNode;
  /**
   * Any background belongs here, on the wrapper. Put it on a child and that
   * child paints over the ink, which then looks like it never drew at all.
   */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const points = useRef<Point[]>([]);
  const nextId = useRef(0);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // The tail retires one segment at a time, always. While the hand is moving
  // new segments arrive faster than this, so the trail holds its length; the
  // moment it stops, the line retracts into nothing.
  useEffect(() => {
    if (!enabled) return;

    const drain = setInterval(() => {
      setSegments((current) => (current.length ? current.slice(1) : current));
    }, DRAIN_MS);

    return () => clearInterval(drain);
  }, [enabled]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;

      // Mouse only. On a touchscreen every scroll is a pointermove, so the
      // trail would scribble itself down the page as the reader scrolls past.
      if (event.pointerType !== "mouse") return;

      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;

      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const previous = points.current[points.current.length - 1];

      if (
        previous &&
        Math.hypot(point.x - previous.x, point.y - previous.y) < MIN_STEP
      ) {
        return;
      }

      points.current.push(point);
      if (points.current.length > 3) points.current.shift();
      if (points.current.length < 3) return;

      const [a, b, c] = points.current as [Point, Point, Point];
      const from = midpoint(a, b);
      const to = midpoint(b, c);

      // Curve through the middle point so the stroke reads as drawn rather
      // than as a chain of straight hops.
      const d = `M ${from.x} ${from.y} Q ${b.x} ${b.y} ${to.x} ${to.y}`;
      const id = nextId.current++;

      setSegments((current) => {
        const next = [...current, { id, d }];
        return next.length > TRAIL ? next.slice(-TRAIL) : next;
      });
    },
    [enabled],
  );

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        points.current = [];
      }}
      className={`relative overflow-hidden ${className}`}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {segments.map((segment, i) => {
          // 0 at the tail, 1 at the head.
          const along = (i + 1) / segments.length;

          return (
            <path
              key={segment.id}
              d={segment.d}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={TAIL_WIDTH + (HEAD_WIDTH - TAIL_WIDTH) * along ** 1.6}
              strokeOpacity={0.95 * along ** 1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>

      <div className="relative">{children}</div>
    </div>
  );
}
