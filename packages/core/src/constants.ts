import { address } from "@solana/kit";

/**
 * Kamino Lend. The program is deployed at the same address on mainnet and
 * devnet, but only mainnet has configured markets and reserves — which is why
 * we develop against a mainnet fork rather than devnet.
 */
export const KAMINO_PROGRAM_ID = address(
  "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
);

/**
 * Kamino's main market. Deep and liquid, but stablecoins, BTC, ETH, SOL and
 * liquid staking tokens only — no tokenized equities.
 */
export const KAMINO_MAIN_MARKET = address(
  "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
);

/**
 * The xStocks market, which is where tokenized equities actually are.
 *
 * Kamino runs more than forty separate lending markets and collateral does not
 * cross between them. Pointing at the main market and expecting to find NVDAx
 * gets you forty-one reserves and no stocks, which is exactly the mistake this
 * constant exists to prevent.
 */
export const KAMINO_XSTOCKS_MARKET = address(
  "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua",
);

/** Draw lends against tokenized equities, so this is our market. */
export const KAMINO_DEFAULT_MARKET = KAMINO_XSTOCKS_MARKET;

export const USDC_MINT = address(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

/** Local surfnet default. Surfpool mirrors the standard validator port. */
export const SURFNET_RPC_URL = "http://127.0.0.1:8899";

/**
 * Compute budget for the draw bundle. Kamino's refresh, deposit and borrow
 * instructions are heavy; this is a starting point that gets tuned against
 * real simulation output rather than guessed at.
 */
export const DEFAULT_COMPUTE_UNIT_LIMIT = 600_000;
export const DEFAULT_COMPUTE_UNIT_PRICE = 1_000;

/**
 * A plain token transfer is nothing like a draw. Requesting the draw's budget
 * for one would have the user's fee payer reserving compute it cannot use.
 */
export const TRANSFER_COMPUTE_UNIT_LIMIT = 60_000;

/** A transaction must serialize below this to be accepted by the network. */
export const MAX_TRANSACTION_BYTES = 1232;

/**
 * Warn while there is still time to react. Once a build creeps past this we
 * need lookup tables or fewer instructions, and finding that out late is
 * expensive.
 */
export const TRANSACTION_SIZE_WARNING_BYTES = 1100;

/** Rent Draw fronts for a user's Kamino accounts on first draw. */
export const SETUP_RENT_LAMPORTS = 50_000_000n;

