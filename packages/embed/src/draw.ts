/**
 * The Draw embed.
 *
 * This is the entire integration surface a merchant sees:
 *
 *   <script src="https://js.draw.fi/v1"></script>
 *   <button onclick="Draw.checkout({ amount: 4000 })">Pay with Draw</button>
 *
 * Small on purpose. The whole argument for Draw is that a site can add
 * portfolio-backed payments in an afternoon, and every extra required line
 * weakens it.
 *
 * No dependencies, no build step, no framework. It has to drop into a plain
 * HTML page from 2011 and work.
 */

export interface CheckoutOptions {
  /** Amount in minor units, so $40.00 is 4000. */
  amount: number;
  currency?: string;
  /** The merchant's own order id, echoed back on the webhook. */
  reference?: string;
  onSuccess?: (result: { sessionId: string; signature: string }) => void;
  onCancel?: () => void;
  onError?: (error: { message: string }) => void;
}

interface CheckoutMessage {
  source: "draw";
  sessionId: string;
  status: "paid" | "cancelled" | "failed";
  signature?: string;
  message?: string;
}

const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 660;

function resolveOrigin(): string {
  // Derive our origin from the script tag that loaded us, so a self-hosted or
  // preview deployment works without the merchant configuring anything.
  const current = document.currentScript as HTMLScriptElement | null;
  if (current?.src) {
    try {
      return new URL(current.src).origin;
    } catch {
      /* fall through */
    }
  }
  return "https://draw.fi";
}

const DRAW_ORIGIN = resolveOrigin();

function buildCheckoutUrl(options: CheckoutOptions, returnUrl?: string): string {
  const url = new URL("/checkout", DRAW_ORIGIN);
  url.searchParams.set("amount", String(options.amount));
  url.searchParams.set("currency", options.currency ?? "USD");
  url.searchParams.set("origin", window.location.origin);

  if (options.reference) url.searchParams.set("reference", options.reference);
  if (returnUrl) url.searchParams.set("return_url", returnUrl);

  return url.toString();
}

export function checkout(options: CheckoutOptions): void {
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;

  // This must happen synchronously inside the click handler. Any await before
  // window.open and the browser treats it as an unsolicited popup and blocks
  // it — a bug that only shows up in real browsers, never in a dev tool.
  const popup = window.open(
    buildCheckoutUrl(options),
    "draw_checkout",
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},resizable=yes`,
  );

  if (!popup) {
    // Blocked anyway (some browsers, some settings). Fall back to a same-tab
    // redirect rather than failing silently, which is what the user would
    // otherwise experience: a button that does nothing.
    window.location.href = buildCheckoutUrl(options, window.location.href);
    return;
  }

  const onMessage = (event: MessageEvent) => {
    // Never trust a message without checking who sent it. Without this check
    // any page could forge a "paid" result.
    if (event.origin !== DRAW_ORIGIN) return;

    const data = event.data as CheckoutMessage | undefined;
    if (!data || data.source !== "draw") return;

    cleanup();

    if (data.status === "paid" && data.signature) {
      options.onSuccess?.({ sessionId: data.sessionId, signature: data.signature });
    } else if (data.status === "cancelled") {
      options.onCancel?.();
    } else {
      options.onError?.({ message: data.message ?? "Payment failed" });
    }
  };

  // A user who closes the popup has cancelled, and no message will arrive to
  // tell us so.
  const closedPoll = window.setInterval(() => {
    if (popup.closed) {
      cleanup();
      options.onCancel?.();
    }
  }, 500);

  function cleanup(): void {
    window.clearInterval(closedPoll);
    window.removeEventListener("message", onMessage);
    if (!popup?.closed) popup?.close();
  }

  window.addEventListener("message", onMessage);
}

declare global {
  interface Window {
    Draw: { checkout: typeof checkout };
  }
}

if (typeof window !== "undefined") {
  window.Draw = { checkout };
}
