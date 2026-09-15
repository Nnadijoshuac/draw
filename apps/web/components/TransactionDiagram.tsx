// What one transaction actually does.
//
// The point of the drawing is the vertical line on the left: the shares are the
// same object at the start and the end. Everything moves around them.

const LEGS = [
  {
    step: "Deposit",
    detail: "0.52 NVDAx moves into your lending position",
    note: "still yours",
  },
  {
    step: "Borrow",
    detail: "$40 of USDC is drawn against it",
    note: "at 4.30% a year",
  },
  {
    step: "Pay",
    detail: "The $40 settles to the merchant",
    note: "under a second",
  },
];

export function TransactionDiagram() {
  return (
    <figure className="mt-12">
      <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] p-5 md:p-8">
        {/* Side by side is the whole point: the same number twice. Too narrow
            for that and they stack, with the pairing carried by the labels. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <Endpoint
            label="Before"
            value="500.00 NVDAx"
            caption="in your account"
          />
          <Endpoint
            label="After"
            value="500.00 NVDAx"
            caption="0.52 held as security"
          />
        </div>

        <ol className="mt-9 space-y-0 border-l border-[var(--color-line)] pl-6">
          {LEGS.map((leg, i) => (
            <li key={leg.step} className="relative pb-7 last:pb-0">
              <span
                aria-hidden
                className="absolute -left-[31px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-paper)]"
              />
              <p className="text-[12px] tabular text-[var(--color-muted)]">
                0{i + 1}
              </p>
              <p className="mt-0.5 text-[16px] font-medium tracking-[-0.01em]">
                {leg.step}
              </p>
              <p className="mt-1 max-w-[46ch] text-[15px] leading-relaxed text-[var(--color-muted)]">
                {leg.detail}{" "}
                <span className="italic">— {leg.note}</span>
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--color-line)] pt-5">
          <span className="rounded-full bg-[var(--color-accent-bg)] px-3 py-1 text-[12px] font-medium text-[var(--color-accent)]">
            One transaction
          </span>
          <span className="text-[14px] text-[var(--color-muted)]">
            All three settle together, or none of them do.
          </span>
        </div>
      </div>

      <figcaption className="mt-3 text-[13px] text-[var(--color-muted)]">
        Taken from a real run: 17 instructions, 1,068 bytes, 320,286 compute
        units.
      </figcaption>
    </figure>
  );
}

function Endpoint({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div>
      <p className="text-[12px] text-[var(--color-muted)]">{label}</p>
      <p className="tabular mt-1 text-[19px] font-semibold tracking-[-0.02em] sm:text-[20px]">
        {value}
      </p>
      <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">{caption}</p>
    </div>
  );
}
