import type { DecimalString } from "./money";

export type Cluster = "surfnet" | "mainnet";

/**
 * Which SPL token program owns a mint. xStocks use Token-2022 while USDC uses
 * the original token program, and the two are not interchangeable.
 */
export type TokenProgram = "spl-token" | "spl-token-2022";

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  program: TokenProgram;
  logoUri?: string;
}

export interface Position {
  mint: string;
  symbol: string;
  /** Token amount held, as a decimal string. */
  amount: DecimalString;
  priceUsd: DecimalString;
  valueUsd: DecimalString;
}

export interface Portfolio {
  owner: string;
  positions: Position[];
  totalValueUsd: DecimalString;
  debtUsd: DecimalString;
  /**
   * What the user may actually spend right now. This is capped by Draw's own
   * risk policy and is deliberately well below the protocol maximum.
   */
  availableToSpendUsd: DecimalString;
  healthFactor: DecimalString | null;
  riskBand: RiskBand;

  /**
   * Stablecoin sitting in the wallet.
   *
   * Only meaningful once a user can draw to themselves — before that it existed
   * for a few hundred milliseconds inside a transaction on its way elsewhere.
   */
  cashUsd: DecimalString;
  /**
   * What it costs to clear the debt and release the collateral. Zero when
   * nothing is owed.
   *
   * Deliberately not a net figure. Holdings minus debt reads as a loss to
   * someone whose shares are still entirely theirs, which is the one thing this
   * product must never imply.
   */
  costToCloseUsd: DecimalString;
  /** How much more stablecoin is needed to cover that. Zero when cash covers it. */
  repayShortfallUsd: DecimalString;
}

/** How close the position is to liquidation. */
export type RiskBand = "none" | "safe" | "warn" | "danger";

export interface Quote {
  sessionId: string;
  amountUsd: DecimalString;
  collateral: {
    mint: string;
    symbol: string;
    /** Collateral that will be locked to support this draw. */
    amountRequired: DecimalString;
    valueUsd: DecimalString;
  };
  borrow: {
    mint: string;
    amount: DecimalString;
    aprPercent: DecimalString;
  };
  /** Projected state once the draw settles. */
  after: {
    healthFactor: DecimalString;
    liquidationPriceUsd: DecimalString;
    riskBand: RiskBand;
  };
  fees: {
    networkFeeUsd: DecimalString;
    drawFeeUsd: DecimalString;
  };
  /** Quotes are short lived; a stale quote must never be signed. */
  expiresAt: string;
}

export type SessionStatus =
  | "pending"
  | "quoted"
  | "signing"
  | "submitted"
  | "paid"
  | "failed"
  | "expired";

export interface Session {
  id: string;
  merchantId: string;
  amountMinor: number;
  currency: string;
  reference?: string;
  status: SessionStatus;
  signature?: string;
  error?: string;
  createdAt: string;
  expiresAt: string;
}

export interface Merchant {
  id: string;
  name: string;
  wallet: string;
  /** Exact origin allowed to receive postMessage results. Never a wildcard. */
  origin: string;
  webhookUrl?: string;
}

/** Result posted back to the merchant page when checkout closes. */
export interface CheckoutResult {
  source: "draw";
  sessionId: string;
  status: "paid" | "cancelled" | "failed";
  signature?: string;
}

/**
 * Server-to-server notification. This, not the postMessage, is the source of
 * truth — a browser can claim anything.
 */
export interface WebhookEvent {
  id: string;
  type: "payment.paid" | "payment.failed";
  createdAt: string;
  data: {
    sessionId: string;
    reference?: string;
    amountMinor: number;
    currency: string;
    signature?: string;
  };
}
