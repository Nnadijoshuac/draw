import { Fragment } from "react";

import { HoldingsField } from "@/components/HoldingsField";

// Full height only where the card field spreads out to fill it. A phone gets
// the field's edge cards instead, and the taller padding there is what keeps
// them clear of the copy — the band above the headline and below the button is
// the room they hang in.
//
// The copy's entrance is cut against the field's, in `HoldingsField`. The claim
// resolves first and alone; the cards are still arriving behind it, and the
// line that threads them lands last, after everything has settled.
const CUE = {
  claim: 120,
  shares: 500,
  /** Between one word of the headline and the next. */
  word: 95,
  sub: 900,
  action: 1120,
} as const;

export function Hero({ repo }: { repo: string }) {
  return (
    <section className="relative flex items-center overflow-hidden lg:min-h-[calc(100vh-7rem)]">
      <HoldingsField />

      <div className="relative mx-auto w-full max-w-2xl px-6 py-32 text-center sm:py-36 lg:py-20">
        <h1 className="mx-auto max-w-[14ch] text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
          <Words text="Pay without selling" from={CUE.claim} />{" "}
          {/* Held back on its own beat. It is the half of the sentence that
              carries the product, and it should land after the setup. */}
          <Words
            text="your shares"
            from={CUE.shares}
            className="font-normal italic text-[var(--color-muted)]"
          />
        </h1>

        <p
          className="settle mx-auto mt-5 max-w-[32ch] text-[16px] leading-relaxed text-[var(--color-muted)]"
          style={{ animationDelay: `${CUE.sub}ms` }}
        >
          Borrow against your portfolio at the checkout. One transaction, no
          credit check.
        </p>

        <div
          className="settle mt-8 flex justify-center"
          style={{ animationDelay: `${CUE.action}ms` }}
        >
          <a
            href={repo}
            className="inline-flex items-center gap-2.5 rounded-[var(--radius-control)] bg-[var(--color-ink)] px-6 py-3.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <GitHubMark />
            View source
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * One word at a time, each on its own beat.
 *
 * Per word rather than per phrase because `settle` moves and blurs, and neither
 * applies to a plain inline element — the span has to be inline-block, and an
 * inline-block phrase cannot break across lines. Words can. The spaces stay
 * outside the spans so the headline wraps exactly where it always did.
 */
function Words({
  text,
  from,
  className = "",
}: {
  text: string;
  from: number;
  className?: string;
}) {
  return text.split(" ").map((word, i) => (
    <Fragment key={`${word}-${i}`}>
      {i > 0 && " "}
      <span
        className={`settle inline-block ${className}`}
        style={{ animationDelay: `${from + i * CUE.word}ms` }}
      >
        {word}
      </span>
    </Fragment>
  ));
}

function GitHubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
