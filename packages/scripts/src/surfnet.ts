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
 */
export async function setTokenBalance(
  rpcUrl: string,
  params: { owner: Address; mint: Address; amount: bigint },
): Promise<void> {
  await callCheat(rpcUrl, "surfnet_setTokenAccount", [
    params.owner,
    params.mint,
    { amount: Number(params.amount) },
  ]);
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
