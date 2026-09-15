import { Hero } from "@/components/Hero";
import { PixelTrail } from "@/components/PixelTrail";
import { TransactionDiagram } from "@/components/TransactionDiagram";

// The live site. Everything here is true: the numbers come from the forked
// mainnet runs, and the transaction signature is real.

const REPO = "https://github.com/Nnadijoshuac/draw";

export default function LandingPage() {
  return (
    <div className="bg-[var(--color-paper)]">
      <Banner />
      <Nav />

      <Hero repo={REPO} />
      <Problem />
      <Mechanism />
      <WhySolana />
      <ForMerchants />
      <Proof />
      <Outro />
      <Footer />
    </div>
  );
}

function Banner() {
  return (
    <div className="border-b border-[var(--color-line)] bg-[var(--color-accent-bg)]">
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-6 py-2.5 text-[13px]">
        <span className="text-[var(--color-ink)]">
          Built for the Stocklana hackathon
        </span>
        <span className="text-[var(--color-muted)]">
          — running against a forked Solana mainnet
        </span>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--color-paper)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="text-[16px] font-semibold tracking-[-0.02em]">Draw</span>
        <nav className="flex items-center gap-6 text-[14px]">
          <a
            href={REPO}
            className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
          >
            Source
          </a>
        </nav>
      </div>
    </header>
  );
}


function Problem() {
  return (
    <Section bordered>
      <Label>The problem</Label>
      <Heading first="Selling is the only option today" second="It shouldn't be" />

      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <div className="max-w-[46ch] space-y-4 text-[16px] leading-relaxed text-[var(--color-muted)]">
          <p>
            The instrument that solves this already exists. It is called
            securities-backed lending, and it is how wealthy people fund their
            lives without liquidating anything they own.
          </p>
          <p>
            It requires a private bank, a six-figure minimum, days of paperwork,
            and market hours.
          </p>
          <p className="text-[var(--color-ink)]">
            Most of the world has no credit bureau, so it has no consumer credit
            at all. The bottleneck was never interest rates. It was the absence of
            anything to underwrite against.
          </p>
        </div>

        <ul className="space-y-3 text-[16px] leading-relaxed">
          {[
            "What if your portfolio could underwrite you?",
            "What if borrowing against it took one tap?",
            "What if the loan and the payment were the same thing?",
          ].map((line) => (
            <li
              key={line}
              className="border-b border-[var(--color-line)] pb-3 italic text-[var(--color-muted)]"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Mechanism() {
  const steps = [
    {
      n: "01",
      title: "You reach the checkout",
      text: "A shop has a Pay with Draw button. No wallet, no seed phrase, no SOL. Signing in is an email address.",
    },
    {
      n: "02",
      title: "Draw prices it against your shares",
      text: "Live oracle prices decide how much collateral a $40 payment needs, and what it would take for that position to be at risk.",
    },
    {
      n: "03",
      title: "One transaction does everything",
      text: "Your collateral is deposited, a stablecoin is borrowed against it, and the merchant is paid. All of it settles together or not at all.",
    },
    {
      n: "04",
      title: "You still own the shares",
      text: "They are held as security, not sold. Repay whenever and they are released.",
    },
  ];

  return (
    <Section bordered>
      <Label>How it works</Label>
      <Heading first="Four steps for you" second="One transaction underneath" />

      <div className="mt-10 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
        {steps.map((step) => (
          <div key={step.n} className="grid gap-3 py-7 md:grid-cols-[4rem_1fr]">
            <span className="tabular text-[14px] text-[var(--color-muted)]">
              {step.n}
            </span>
            <div>
              <h3 className="text-[19px] font-medium tracking-[-0.01em]">
                {step.title}
              </h3>
              <p className="mt-2 max-w-[56ch] text-[16px] leading-relaxed text-[var(--color-muted)]">
                {step.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      <TransactionDiagram />
    </Section>
  );
}

function WhySolana() {
  return (
    <Section bordered>
      <Label>Why this is only possible here</Label>
      <Heading
        first="The loan and the payment"
        second="are the same transaction"
      />

      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <p className="max-w-[46ch] text-[16px] leading-relaxed text-[var(--color-muted)]">
          There is no moment where a person has taken on debt but the shop has not
          been paid. Off-chain those are two systems, two settlement windows and a
          reconciliation problem. Here they are seventeen instructions that either
          all succeed or none do.
        </p>

        <dl className="space-y-5">
          {[
            [
              "Open at 3am on a Sunday",
              "Tokenized equities trade when the stock market is shut.",
            ],
            [
              "Collateral nobody has to approve",
              "xStocks are Token-2022 with no freeze authority. Anyone can post them.",
            ],
            [
              "No credit file required",
              "The collateral is the underwriting, so there is nothing to score.",
            ],
            [
              "The user never holds SOL",
              "Draw sponsors the network fee and the account rent.",
            ],
          ].map(([term, def]) => (
            <div key={term} className="border-b border-[var(--color-line)] pb-5">
              <dt className="text-[15px] font-medium">{term}</dt>
              <dd className="mt-1 max-w-[46ch] text-[15px] leading-relaxed text-[var(--color-muted)]">
                {def}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}

function ForMerchants() {
  return (
    <Section bordered>
      <Label>For merchants</Label>
      <Heading first="Draw is not a destination" second="It is a payment button" />

      <p className="mt-8 max-w-[52ch] text-[16px] leading-relaxed text-[var(--color-muted)]">
        Every other product in this category wants to own the customer. Draw wants
        to be the rail underneath somebody else&apos;s checkout. That is the whole
        integration:
      </p>

      <pre className="mt-7 overflow-x-auto rounded-[var(--radius-card)] bg-[var(--color-ink)] p-5 text-[13px] leading-relaxed text-white">
        <code>{`<script src="https://js.draw.fi/v1"></script>

<button onclick="Draw.checkout({ amount: 4000 })">
  Pay with Draw
</button>`}</code>
      </pre>

      <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[var(--color-muted)]">
        The payee is resolved from the site&apos;s own origin, never from the
        request, and settlement is confirmed by a signed webhook rather than
        anything the browser claims.
      </p>
    </Section>
  );
}

function Proof() {
  return (
    <Section bordered>
      <Label>What is actually built</Label>
      <Heading first="Not a mockup" second="Real reserves, real prices" />

      <p className="mt-8 max-w-[54ch] text-[16px] leading-relaxed text-[var(--color-muted)]">
        Draw runs against a forked Solana mainnet, using Kamino&apos;s live xStocks
        lending market, real oracle prices and real token mints. Cloned mainnet
        state, not fixtures. Pointing it at live mainnet is a change of
        environment variable, not a change of code.
      </p>

      <div className="mt-9 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-3">
        {[
          ["17", "instructions, one transaction"],
          ["1,068", "bytes, under the 1,232 limit"],
          ["35%", "loan to value, half what Kamino allows"],
        ].map(([figure, caption]) => (
          <div key={caption} className="bg-[var(--color-paper)] p-6">
            <p className="tabular text-[30px] font-semibold tracking-[-0.03em]">
              {figure}
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-muted)]">
              {caption}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[14px] leading-relaxed text-[var(--color-muted)]">
        The cap is deliberate. Tokenized stocks trade 24/7 but the underlying
        market does not, so a position opened on Saturday can gap at Monday&apos;s
        open with no chance to react. The gap between 35% and 65% is the
        user&apos;s margin.
      </p>
    </Section>
  );
}

function Outro() {
  return (
    <PixelTrail>
      <section className="border-t border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-5xl px-6 py-28 text-center">
        <h2 className="mx-auto max-w-[18ch] text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
          Get the value.
          <span className="block font-normal italic text-[var(--color-muted)]">
            Don&apos;t give up the gains.
          </span>
        </h2>

        <div className="mt-9 flex justify-center">
          <a
            href={REPO}
            className="rounded-[var(--radius-control)] bg-[var(--color-ink)] px-6 py-3.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Read the source
          </a>
        </div>
      </div>
      </section>
    </PixelTrail>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--color-line)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-[13px] text-[var(--color-muted)]">
        <span>Draw — spend against what you own</span>
        <span>Built on Solana with Kamino and xStocks</span>
      </div>
    </footer>
  );
}

/* ---- shared ---- */

function Section({
  children,
  bordered,
}: {
  children: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <section
      className={bordered ? "border-t border-[var(--color-line)]" : undefined}
    >
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-medium text-[var(--color-accent)]">
      {children}
    </p>
  );
}

function Heading({ first, second }: { first: string; second: string }) {
  return (
    <h2 className="mt-5 max-w-[20ch] text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
      {first}
      <span className="block font-normal italic text-[var(--color-muted)]">
        {second}
      </span>
    </h2>
  );
}
