import type { Portfolio, Quote, WebhookEvent } from "@draw/shared";

/**
 * @draw/sdk — the integration surface.
 *
 * Two audiences, deliberately kept apart:
 *
 *   - a merchant's server verifies webhooks, which is the only thing it should
 *     ever ship goods against
 *   - a merchant's page opens checkout (see @draw/embed, three lines, no build)
 *
 * Nothing here knows about Solana, wallets, collateral or liquidation. That is
 * the product: a payment button whose funding source happens to be a
 * portfolio. If integrating required understanding any of it, the whole
 * argument for Draw would collapse.
 */

export interface DrawConfig {
  /** Server-side key identifying the merchant. Never ship this to a browser. */
  secretKey?: string;
  /** Override for self-hosted or preview deployments. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class DrawApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DrawApiError";
  }
}

const DEFAULT_BASE_URL = "https://draw.fi";

export class Draw {
  private readonly baseUrl: string;
  private readonly secretKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: DrawConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.secretKey = config.secretKey;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.secretKey ? { authorization: `Bearer ${this.secretKey}` } : {}),
        ...init?.headers,
      },
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      throw new DrawApiError(
        response.status,
        String(body.code ?? "unknown"),
        String(body.error ?? "Request failed"),
      );
    }

    return body as T;
  }

  /** What a wallet holds and can spend. */
  async getPortfolio(owner: string): Promise<Portfolio> {
    return this.request<Portfolio>(
      `/api/positions?owner=${encodeURIComponent(owner)}`,
    );
  }

  /** Price a draw without committing to it. */
  async quote(params: {
    sessionId: string;
    owner: string;
    amount: number;
  }): Promise<Quote> {
    return this.request<Quote>("/api/quote", {
      method: "POST",
      body: JSON.stringify({
        sessionId: params.sessionId,
        owner: params.owner,
        amountMinor: params.amount,
      }),
    });
  }
}

/**
 * Verify a webhook actually came from Draw.
 *
 * Always call this before acting on a webhook. Your endpoint is a public URL
 * and anyone can POST to it; the signature is the only thing separating a real
 * payment from someone claiming one.
 *
 * Rejects signatures older than `toleranceSeconds` so a captured payload
 * cannot be replayed later.
 */
export async function verifyWebhook(params: {
  secret: string;
  /** The raw x-draw-signature header. */
  signature: string;
  /** The raw request body, before JSON parsing. Reserializing breaks the MAC. */
  body: string;
  toleranceSeconds?: number;
}): Promise<WebhookEvent> {
  const { secret, signature, body, toleranceSeconds = 300 } = params;

  const parts = new Map(
    signature.split(",").map((part) => {
      const [key = "", value = ""] = part.split("=");
      return [key.trim(), value.trim()] as const;
    }),
  );

  const timestamp = Number(parts.get("t"));
  const provided = parts.get("v1");

  if (!Number.isFinite(timestamp) || !provided) {
    throw new Error("Malformed Draw signature header");
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) {
    throw new Error(`Draw signature is ${age}s old; refusing to accept it`);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );

  const expected = Array.from(new Uint8Array(mac), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  if (!timingSafeEqual(expected, provided)) {
    throw new Error("Draw signature did not match");
  }

  return JSON.parse(body) as WebhookEvent;
}

/**
 * Constant-time string compare.
 *
 * A plain `===` returns as soon as two characters differ, and that timing
 * difference is enough to recover a signature one character at a time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export type { Portfolio, Quote, WebhookEvent };
