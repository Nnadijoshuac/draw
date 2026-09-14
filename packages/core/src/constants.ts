import { PublicKey } from "@solana/web3.js";

/**
 * Kamino Lend. The program is deployed at the same address on mainnet and
 * devnet, but only mainnet has configured markets and reserves — which is why
 * we develop against a mainnet fork rather than devnet.
 */
export const KAMINO_PROGRAM_ID = new PublicKey(
  "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
);

/** Kamino's main lending market, where the xStocks reserves live. */
export const KAMINO_MAIN_MARKET = new PublicKey(
  "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
);

export const USDC_MINT = new PublicKey(
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

/** A transaction must serialize below this to be accepted by the network. */
export const MAX_TRANSACTION_BYTES = 1232;

/**
 * Warn while there is still time to react. Once a build creeps past this we
 * need lookup tables or fewer instructions, and finding that out late is
 * expensive.
 */
export const TRANSACTION_SIZE_WARNING_BYTES = 1100;
