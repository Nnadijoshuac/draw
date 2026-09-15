"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A trail of pixels under the cursor, each fading out over three seconds.
//
// Snapped to a grid rather than following the pointer exactly, so it reads as
// something being drawn rather than a smear. Only the closing section gets it:
// one flourish, in the place where there is nothing left to read.

const CELL = 10;
const LIFETIME = 3000;
/** Oldest are dropped past this, so a fast scribble cannot flood the DOM. */
const MAX_PIXELS = 260;

type Pixel = { id: number; x: number; y: number };

export function PixelTrail({
  children,
  className = "",
}: {
  children: React.ReactNode;
  /**
   * Any background belongs here, on the wrapper. Put it on a child and that
   * child paints over the pixels, which look like they never drew at all.
   */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const lastCell = useRef("");
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;

      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;

      const col = Math.floor((event.clientX - rect.left) / CELL);
      const row = Math.floor((event.clientY - rect.top) / CELL);
      const cell = `${col},${row}`;

      // One pixel per cell entered. Without this a slow drag stacks dozens of
      // them in the same square and the fade looks like a solid block.
      if (cell === lastCell.current) return;
      lastCell.current = cell;

      const id = nextId.current++;
      setPixels((current) => {
        const next = [...current, { id, x: col * CELL, y: row * CELL }];
        return next.length > MAX_PIXELS ? next.slice(-MAX_PIXELS) : next;
      });

      const timer = setTimeout(() => {
        setPixels((current) => current.filter((pixel) => pixel.id !== id));
        timers.current.delete(timer);
      }, LIFETIME);

      timers.current.add(timer);
    },
    [enabled],
  );

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        lastCell.current = "";
      }}
      className={`relative overflow-hidden ${className}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {pixels.map((pixel) => (
          <span
            key={pixel.id}
            className="pixel absolute bg-[var(--color-accent)]"
            style={{
              left: pixel.x,
              top: pixel.y,
              width: CELL,
              height: CELL,
            }}
          />
        ))}
      </div>

      <div className="relative">{children}</div>
    </div>
  );
}
