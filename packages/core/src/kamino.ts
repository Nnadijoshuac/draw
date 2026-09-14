import { createNoopSigner, type Address, type Instruction } from "@solana/kit";
import {
  KaminoAction,
  KaminoMarket,
  VanillaObligation,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  getCurrentLedgerInstant,
  type KaminoReserve,
} from "@kamino-finance/klend-sdk";
import Decimal from "decimal.js";
import { KAMINO_DEFAULT_MARKET, KAMINO_PROGRAM_ID } from "./constants.js";
import type { SolanaRpc } from "./connection.js";

/**
 * Thin adapter over Kamino Lend.
 *
 * Draw does not implement lending. Kamino already does that well, and the
 * product we are building sits on top of it: we turn a borrow into a payment.
 * Everything protocol-specific is confined to this file so the rest of the
 * codebase talks about collateral and debt rather than obligations and
 * reserves.
 */

export interface KaminoContext {
  market: KaminoMarket;
  marketAddress: Address;
}

let cachedMarket: KaminoMarket | null = null;

/**
 * Load the lending market and its reserves.
 *
 * Reserve state moves with every slot, so callers that care about current
 * pricing should pass `refresh` rather than reuse a market loaded minutes ago.
 */
export async function loadMarket(
  rpc: SolanaRpc,
  options: { marketAddress?: Address; refresh?: boolean } = {},
): Promise<KaminoContext> {
  const marketAddress = options.marketAddress ?? KAMINO_DEFAULT_MARKET;

  if (cachedMarket && !options.refresh) {
    return { market: cachedMarket, marketAddress };
  }

  const market = await KaminoMarket.load(
    rpc,
    marketAddress,
    DEFAULT_RECENT_SLOT_DURATION_MS,
    KAMINO_PROGRAM_ID,
    true,
  );

  if (!market) {
    throw new Error(`Kamino market not found at ${marketAddress}`);
  }

  await market.loadReserves();
  cachedMarket = market;

  return { market, marketAddress };
}

export interface ReserveSummary {
  address: Address;
  mint: Address;
  symbol: string;
  decimals: number;
  /** Protocol maximum. Draw's own cap is deliberately far below this. */
  maxLtv: Decimal;
  liquidationThreshold: Decimal;
  borrowApr: Decimal;
  /** False when the reserve is paused or cannot currently be borrowed against. */
  borrowable: boolean;
}

/**
 * Summarise a reserve into the handful of numbers the product actually needs.
 *
 * The liquidation threshold in particular must be read from the reserve rather
 * than hardcoded â€” it differs per asset and changes when Kamino reconfigures a
 * market, and a stale copy would put our health factor out of step with the
 * protocol's.
 */
export async function summariseReserve(
  rpc: SolanaRpc,
  market: KaminoMarket,
  mint: Address,
): Promise<ReserveSummary | null> {
  const reserve = findReserveByMint(market, mint);
  if (!reserve) return null;

  const config = reserve.state.config;

  // Borrow rates accrue per second, so the APR has to be evaluated at a
  // coherent ledger instant rather than a bare slot.
  const instant = await getCurrentLedgerInstant(rpc);

  return {
    address: reserve.address,
    mint,
    symbol: reserve.getTokenSymbol(),
    decimals: reserve.getMintDecimals(),
    maxLtv: new Decimal(config.loanToValuePct.toString()).div(100),
    liquidationThreshold: new Decimal(
      config.liquidationThresholdPct.toString(),
    ).div(100),
    borrowApr: new Decimal(reserve.calculateBorrowAPR(instant, 0)),
    borrowable: config.status === 0,
  };
}

/**
 * A mint can back more than one reserve â€” Kamino runs float and fixed rate
 * variants of the same asset. We take the first, which is the float reserve,
 * because that is what the lending UI treats as the default market.
 */
function findReserveByMint(
  market: KaminoMarket,
  mint: Address,
): KaminoReserve | undefined {
  return market.getReservesByMint(mint)[0];
}

export interface DrawInstructionsParams {
  rpc: SolanaRpc;
  owner: Address;
  collateralMint: Address;
  /** Collateral to deposit, in base units, as a decimal string. */
  depositAmount: string;
  debtMint: Address;
  /** Stablecoin to borrow, in base units, as a decimal string. */
  borrowAmount: string;
  marketAddress?: Address;
}

export interface DrawInstructions {
  instructions: Instruction[];
  /** Labels in the same order, which make a failed simulation readable. */
  labels: string[];
}

/**
 * Build the deposit-and-borrow half of a draw.
 *
 * Kamino exposes this as a single action rather than a deposit followed by a
 * borrow, which matters: both legs land on the same obligation by construction,
 * so there is no way to accidentally deposit into one position and borrow
 * against another.
 */
export async function buildDrawInstructions(
  params: DrawInstructionsParams,
): Promise<DrawInstructions> {
  const { rpc, owner, collateralMint, depositAmount, debtMint, borrowAmount } =
    params;

  const { market } = await loadMarket(rpc, {
    marketAddress: params.marketAddress,
    refresh: true,
  });

  const collateralReserve = findReserveByMint(market, collateralMint);
  if (!collateralReserve) {
    throw new Error(`No Kamino reserve for collateral mint ${collateralMint}`);
  }

  const debtReserve = findReserveByMint(market, debtMint);
  if (!debtReserve) {
    throw new Error(`No Kamino reserve for debt mint ${debtMint}`);
  }

  const action = await KaminoAction.buildDepositAndBorrowTxns({
    kaminoMarket: market,
    depositAmount,
    depositReserveAddress: collateralReserve.address,
    borrowAmount,
    borrowReserveAddress: debtReserve.address,
    // The user signs in the browser; here we only need their address to build.
    owner: createNoopSigner(owner),
    obligation: new VanillaObligation(KAMINO_PROGRAM_ID),
    useV2Ixs: true,
    scopeRefreshConfig: undefined,
    currentLedgerInstant: await getCurrentLedgerInstant(rpc),
    includeAtaIxs: true,
    requestElevationGroup: false,
  });

  return {
    instructions: collectInstructions(action),
    labels: collectLabels(action),
  };
}

/**
 * Flatten a KaminoAction into a single ordered instruction list.
 *
 * The ordering is not arbitrary. `inBetweenIxs` has to sit between the deposit
 * and the borrow â€” it carries the obligation refresh that makes the freshly
 * deposited collateral visible to the borrow that follows it.
 */
function collectInstructions(action: KaminoAction): Instruction[] {
  return [
    ...action.setupIxs,
    ...action.inBetweenIxs,
    ...action.lendingIxs,
    ...action.postLendingIxs,
    ...action.cleanupIxs,
  ];
}

function collectLabels(action: KaminoAction): string[] {
  return [
    ...action.setupIxsLabels,
    ...action.lendingIxsLabels,
    ...action.postLendingIxsLabels,
    ...action.cleanupIxsLabels,
  ];
}

/** Drop the cached market. Used by scripts that switch clusters mid-run. */
export function clearMarketCache(): void {
  cachedMarket = null;
}

