import { fetchEncodedAccount, type Address } from "@solana/kit";
import Decimal from "decimal.js";
import type { SolanaRpc } from "./connection";

/**
 * Is the tokenized share still worth the share?
 *
 * Draw prices collateral from Kamino's oracle, which prices NVDAx. Everything
 * downstream — the 35% cap, the liquidation price we show — assumes an NVDAx is
 * an Nvidia share. It is not. It is a claim on one, issued by somebody, and
 * claims can trade away from the thing they claim.
 *
 * Pyth publishes that gap directly as a redemption rate: NVDAx quoted in NVDA,
 * updated around the clock even when the equity market is shut. A rate of 1.0
 * means the wrapper is holding. Anything else is the number nobody else in this
 * codebase was looking at.
 *
 * Read straight off the price account over the same RPC everything else uses.
 * No API key, no subscription, no dependency on a service that can bill us.
 */

/** Pyth's sponsored push account for NVDAx quoted in NVDA, shard 0. */
export const NVDAX_REDEMPTION_RATE = "9Qxr7ZFsMCoA7Yo1vEMc23mqeZX5qx6xBo5jbHgVHKir" as Address;

/** The regular Nvidia equity feed. Only moves while the US market is open. */
export const NVDA_EQUITY_FEED = "2w1Tg1XTZbUib7srfRoStJ4v5JXVsK7roQEGMsMaGZFC" as Address;

/**
 * PriceUpdateV2, 134 bytes. Offsets rather than a schema because this is the
 * only Pyth account Draw reads and a decoder library is not worth the weight.
 *
 *   0   discriminator        8
 *   8   write authority     32
 *   40  verification level   1   ← one byte, not two
 *   41  feed id             32
 *   73  price               i64
 *   81  confidence          u64
 *   89  exponent            i32
 *   93  publish time        i64
 *
 * Verified by decoding the live account rather than by reading the struct
 * definition: an off-by-one here reads the exponent out of the middle of a
 * timestamp, and `10 ** that` takes the process down before anything throws.
 */
const PRICE_UPDATE_V2_LEN = 134;
const OFFSET_PRICE = 73;
const OFFSET_CONFIDENCE = 81;
const OFFSET_EXPONENT = 89;
const OFFSET_PUBLISH_TIME = 93;

/** Pyth exponents are small negatives. Anything else means a bad decode. */
const MIN_EXPONENT = -12;
const MAX_EXPONENT = 0;

export class PythUnavailableError extends Error {
  constructor(public readonly account: Address, reason: string) {
    super(`Pyth feed ${account} unavailable: ${reason}`);
    this.name = "PythUnavailableError";
  }
}

export interface PythPrice {
  value: Decimal;
  /** Pyth's own uncertainty band. Wide means the publishers disagree. */
  confidence: Decimal;
  publishedAt: Date;
  ageSeconds: number;
}

export async function readPythPrice(
  rpc: SolanaRpc,
  account: Address,
): Promise<PythPrice> {
  const fetched = await fetchEncodedAccount(rpc, account);
  if (!fetched.exists) {
    throw new PythUnavailableError(account, "no such account");
  }
  if (fetched.data.length !== PRICE_UPDATE_V2_LEN) {
    throw new PythUnavailableError(
      account,
      `expected ${PRICE_UPDATE_V2_LEN} bytes, got ${fetched.data.length}`,
    );
  }

  const view = new DataView(
    fetched.data.buffer,
    fetched.data.byteOffset,
    fetched.data.byteLength,
  );

  const exponent = view.getInt32(OFFSET_EXPONENT, true);

  // Guard before the exponentiation, not after. A misread exponent is not a
  // wrong number, it is an allocation big enough to kill the process.
  if (exponent < MIN_EXPONENT || exponent > MAX_EXPONENT) {
    throw new PythUnavailableError(account, `implausible exponent ${exponent}`);
  }

  const scale = new Decimal(10).pow(exponent);

  const price = new Decimal(view.getBigInt64(OFFSET_PRICE, true).toString());
  const confidence = new Decimal(
    view.getBigUint64(OFFSET_CONFIDENCE, true).toString(),
  );
  const publishTime = Number(view.getBigInt64(OFFSET_PUBLISH_TIME, true));

  return {
    value: price.mul(scale),
    confidence: confidence.mul(scale),
    publishedAt: new Date(publishTime * 1000),
    ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - publishTime),
  };
}

export interface PegStatus {
  /** NVDAx priced in NVDA. 1.0 is a perfect peg. */
  rate: Decimal;
  /** How far off the peg, as a percentage. Always positive. */
  driftPercent: Decimal;
  ageSeconds: number;
}

/**
 * How far the wrapper has drifted from the share behind it.
 *
 * Deliberately direction-agnostic. A premium is not safer than a discount —
 * both mean the collateral is not worth what the lending market thinks, and a
 * premium unwinds downwards.
 */
export async function getPegStatus(
  rpc: SolanaRpc,
  account: Address = NVDAX_REDEMPTION_RATE,
): Promise<PegStatus> {
  const price = await readPythPrice(rpc, account);

  if (price.value.lte(0)) {
    throw new PythUnavailableError(account, "redemption rate is zero");
  }

  return {
    rate: price.value,
    driftPercent: price.value.sub(1).abs().mul(100),
    ageSeconds: price.ageSeconds,
  };
}
