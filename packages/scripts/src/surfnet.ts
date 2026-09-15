import type { Address } from "@solana/kit";

/**
 * Surfpool cheatcodes.
 *
 * Surfnet forks mainnet copy-on-read, so every account we touch — Kamino's
 * reserves, the xStocks mints, Jupiter's pools — is the real thing, lazily
 * fetched. On top of that it exposes `surfnet_*` methods that let us write
 * accounts directly, which is how we hand ourselves test money without
 * spending any.
 *
 * The method names below are the ones surfpool documents. They have moved
 * between releases, so `callCheat` reports the available set on a method-not-
 * found rather than failing with something opaque.
 */

interface RpcError {
  code: number;
  message: string;
}

async function callCheat(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(
      `${method} failed: ${response.status} ${response.statusText}. Is surfpool running?`,
    );
  }

  const body = (await response.json()) as { result?: unknown; error?: RpcError };

  if (body.error) {
    if (body.error.code === -32601) {
      throw new Error(
        `Surfpool does not expose "${method}" in this version. ` +
          `Run "surfpool --version" and check the cheatcode names in the surfpool docs, then update src/surfnet.ts.`,
      );
    }
    throw new Error(`${method} failed: ${body.error.message}`);
  }

  return body.result;
}

/** Give an account SOL. Used for the fee payer, which sponsors every draw. */
export async function setLamports(
  rpcUrl: string,
  account: Address,
  lamports: number,
): Promise<void> {
  await callCheat(rpcUrl, "surfnet_setAccount", [account, { lamports }]);
}

/**
 * Write a token balance directly.
 *
 * This is the whole reason the zero-budget build works: we can hold $10,000 of
 * collateral on a forked mainnet and test liquidation edges we could never
 * afford to test with real money.
 *
 * The token program must be passed explicitly. Without it the cheatcode
 * defaults to the legacy program and silently writes the balance into a legacy
 * account, which for a Token-2022 mint like an xStock means the tokens land at
 * an address nothing will ever look at — the balance reads zero everywhere and
 * nothing errors.
 */
export async function setTokenBalance(
  rpcUrl: string,
  params: {
    owner: Address;
    mint: Address;
    amount: bigint;
    tokenProgram: Address;
  },
): Promise<void> {
  await callCheat(rpcUrl, "surfnet_setTokenAccount", [
    params.owner,
    params.mint,
    { amount: Number(params.amount) },
    params.tokenProgram,
  ]);
}

/**
 * Keep a cloned account in sync with mainnet.
 *
 * This is what stops Kamino refusing to lend an hour into a session. A fork
 * clones an oracle once, the local clock keeps moving, and the price ages past
 * the protocol's max_age even though nothing is wrong. Streaming re-pulls it in
 * the background so it stays current.
 */
export async function streamAccount(
  rpcUrl: string,
  account: Address,
): Promise<void> {
  await callCheat(rpcUrl, "surfnet_streamAccount", [account]);
}

/**
 * Which accounts are safe to stream or re-pull.
 *
 * Sysvars are maintained by the runtime, not cloned from mainnet, and asking
 * surfpool to overwrite one kills the process outright: "Failed to set account
 * SysvarRent111...: Invalid Rent sysvar data". Programs never change either, so
 * both are skipped. What is left is the reserves, oracles and mints, which are
 * the accounts that actually go stale.
 */
export function isRefreshable(account: Address): boolean {
  const value = account.toString();
  if (value.startsWith("Sysvar")) return false;
  if (value === "11111111111111111111111111111111") return false;
  // Program ids in this set are recognisable by their vanity prefixes.
  return !/^(Token|ATokenGPvb|KLend|Farms|ComputeBudget|AddressLookupTab1e)/.test(
    value,
  );
}

/** Re-pull an account from mainnet once. The immediate fix for a stale price. */
export async function resetAccount(
  rpcUrl: string,
  account: Address,
): Promise<void> {
  await callCheat(rpcUrl, "surfnet_resetAccount", [account]);
}

/** Confirm we are actually talking to a surfnet before trying to cheat on it. */
export async function assertSurfnet(rpcUrl: string): Promise<void> {
  try {
    await callCheat(rpcUrl, "getHealth", []);
  } catch {
    throw new Error(
      `No Solana RPC at ${rpcUrl}. Start the fork first:\n\n` +
        `  surfpool start --url https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY\n`,
    );
  }
}
