import {
  createNoopSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  KaminoAction,
  KaminoMarket,
  UserMetadata,
  VanillaObligation,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  getCurrentLedgerInstant,
  type KaminoReserve,
} from "@kamino-finance/klend-sdk";
import Decimal from "decimal.js";
import { KAMINO_DEFAULT_MARKET, KAMINO_PROGRAM_ID } from "./constants";
import type { SolanaRpc } from "./connection";

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
 * than hardcoded — it differs per asset and changes when Kamino reconfigures a
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
 * A mint can back more than one reserve — Kamino runs float and fixed rate
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

export interface InstructionGroup {
  instructions: Instruction[];
  /** Labels in the same order, which make a failed simulation readable. */
  labels: string[];
}

export interface DrawInstructions {
  /**
   * One-time account creation: user metadata, the obligation, farm state and
   * the user's lookup table. Empty once a user has drawn before.
   */
  setup: InstructionGroup;
  /** The deposit, borrow and their refreshes. Runs on every draw. */
  draw: InstructionGroup;
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
    setup: {
      instructions: [...action.setupIxs],
      labels: [...action.setupIxsLabels],
    },
    draw: interleaveLendingIxs(action),
  };
}

/**
 * Repay debt and release the collateral behind it.
 *
 * The other half of the product. Borrowing against shares you cannot get back
 * is not credit, it is a sale with extra steps.
 */
export async function buildRepayInstructions(params: {
  rpc: SolanaRpc;
  owner: Address;
  debtMint: Address;
  /** Base units to repay. */
  amount: string;
  marketAddress?: Address;
}): Promise<InstructionGroup> {
  const { rpc, owner, debtMint, amount } = params;

  const { market } = await loadMarket(rpc, {
    marketAddress: params.marketAddress,
    refresh: true,
  });

  const debtReserve = findReserveByMint(market, debtMint);
  if (!debtReserve) {
    throw new Error(`No Kamino reserve for debt mint ${debtMint}`);
  }

  const action = await KaminoAction.buildRepayTxns({
    kaminoMarket: market,
    amount,
    reserveAddress: debtReserve.address,
    owner: createNoopSigner(owner),
    obligation: new VanillaObligation(KAMINO_PROGRAM_ID),
    useV2Ixs: true,
    scopeRefreshConfig: undefined,
    currentLedgerInstant: await getCurrentLedgerInstant(rpc),
    includeAtaIxs: true,
    requestElevationGroup: false,
  });

  return {
    instructions: [
      ...action.setupIxs,
      ...action.inBetweenIxs,
      ...action.lendingIxs,
      ...action.postLendingIxs,
      ...action.cleanupIxs,
    ],
    labels: [
      ...action.setupIxsLabels,
      ...action.lendingIxsLabels,
      ...action.postLendingIxsLabels,
      ...action.cleanupIxsLabels,
    ],
  };
}

/**
 * Order the lending instructions the way the program expects.
 *
 * inBetweenIxs goes *between* the deposit and the borrow, not before both: it
 * carries the obligation refresh that makes the freshly deposited collateral
 * visible. Run it first and the refresh sees an empty obligation, which fails
 * with InvalidAccountInput rather than anything that names the real problem.
 */
function interleaveLendingIxs(action: KaminoAction): InstructionGroup {
  const [deposit, ...rest] = action.lendingIxs;
  const [depositLabel, ...restLabels] = action.lendingIxsLabels;

  const between = action.inBetweenIxs;

  return {
    instructions: [
      ...(deposit ? [deposit] : []),
      ...between,
      ...rest,
      ...action.postLendingIxs,
      ...action.cleanupIxs,
    ],
    labels: [
      ...(depositLabel ? [depositLabel] : []),
      ...between.map((_, i) => `inBetween[${i}]`),
      ...restLabels,
      ...action.postLendingIxsLabels,
      ...action.cleanupIxsLabels,
    ],
  };
}

export interface ObligationSummary {
  /** Collateral currently posted, in USD. */
  depositedUsd: Decimal;
  /** Outstanding debt, in USD. */
  borrowedUsd: Decimal;
  /** Debt in the debt mint's base units, for building a repayment. */
  borrowedBaseUnits: bigint;
}

/**
 * What the user currently owes.
 *
 * Read from chain rather than assumed. A product that can lend but cannot tell
 * you what you owe is not a credit product.
 */
export async function getObligationSummary(
  rpc: SolanaRpc,
  owner: Address,
  debtMint: Address,
  marketAddress?: Address,
): Promise<ObligationSummary> {
  const empty: ObligationSummary = {
    depositedUsd: new Decimal(0),
    borrowedUsd: new Decimal(0),
    borrowedBaseUnits: 0n,
  };

  const { market } = await loadMarket(rpc, { marketAddress, refresh: true });

  const obligation = await market.getObligationByWallet(
    owner,
    new VanillaObligation(KAMINO_PROGRAM_ID),
  );
  if (!obligation) return empty;

  const debtReserve = findReserveByMint(market, debtMint);
  const borrow = obligation
    .getBorrows()
    .find((position) => position.mintAddress === debtMint);

  if (!borrow || !debtReserve) {
    return { ...empty, depositedUsd: obligation.getDepositedValue() };
  }

  // Round up. Repaying a hair less than owed leaves dust debt behind and the
  // position stays open, which is a confusing place to leave someone.
  const borrowedBaseUnits = BigInt(borrow.amount.ceil().toFixed(0));

  return {
    depositedUsd: obligation.getDepositedValue(),
    borrowedUsd: borrow.marketValueRefreshed,
    borrowedBaseUnits,
  };
}

/**
 * The lookup table Kamino created for this user during setup.
 *
 * Without it the draw does not fit in a transaction, so this is not an
 * optimisation. Returns null before the user has been set up.
 */
export async function getUserLookupTable(
  rpc: SolanaRpc,
  owner: Address,
): Promise<Address | null> {
  const [userMetadataAddress] = await getProgramDerivedAddress({
    programAddress: KAMINO_PROGRAM_ID,
    seeds: [new TextEncoder().encode("user_meta"), getAddressEncoder().encode(owner)],
  });

  const metadata = await UserMetadata.fetch(
    rpc,
    userMetadataAddress,
    KAMINO_PROGRAM_ID,
  );
  if (!metadata) return null;

  const lut = metadata.userLookupTable;
  return lut === SYSTEM_PROGRAM_ADDRESS ? null : lut;
}

/**
 * Does this user still need their Kamino accounts created?
 *
 * Kamino always emits an idempotent create-ATA instruction, so a non-empty
 * setup group does not by itself mean anything is missing. Only the
 * account-creating instructions do.
 */
export function needsAccountSetup(setupLabels: string[]): boolean {
  return setupLabels.some((label) =>
    /^(initUserMetadata|InitObligation|createUserLut)/i.test(label),
  );
}

/** Drop the cached market. Used by scripts that switch clusters mid-run. */
export function clearMarketCache(): void {
  cachedMarket = null;
}

