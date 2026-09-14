/**
 * Unstyled placeholder. The real landing page is built from the design
 * reference; this exists so the app boots and routing works.
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Draw</h1>
      <p className="mt-3 text-lg text-[var(--color-muted)]">
        Spend against what you own.
      </p>
      <p className="mt-8 max-w-prose text-sm leading-relaxed">
        Pay for things using your tokenized stock as collateral, without selling
        it. One tap, one transaction, and you keep every share.
      </p>
    </main>
  );
}
