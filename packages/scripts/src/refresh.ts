import { createChainClient, loadMarket } from "@draw/core";
import { env } from "./env";
import { oracleAccountsFor } from "./oracles";
import { resetAccount } from "./surfnet";

/**
 * Re-pull the oracle prices from mainnet.
 *
 * A fork clones an oracle once and the local clock keeps moving, so after about
 * half an hour Kamino rejects every borrow with ReserveStale. This pulls them
 * again.
 *
 * Only the price accounts are touched. Re-pulling a reserve or its vaults would
 * overwrite them with mainnet state and erase every deposit made on the fork,
 * which looks exactly like data loss because it is.
 *
 * `surfnet_streamAccount` used to be in here and is deliberately gone. It keeps
 * an account current for RPC reads — the quote prices fine, the transaction
 * builds fine — while the account the runtime executes against ends up empty,
 * and the lending program panics reading it:
 *
 *   panicked at 'range end index 8 out of range for slice of length 0',
 *   programs/klend/src/utils/prices/scope.rs:66
 *
 * Nothing in that names an oracle, a stream, or a fork. Draws would work for a
 * few minutes after a reset and then quietly stop.
 *
 *   pnpm refresh            once
 *   pnpm refresh --watch    every two minutes, for a recording session
 */

const WATCH_INTERVAL_MS = 120_000;

async function refreshOnce(): Promise<{ done: number; total: number }> {
  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });
  const { market } = await loadMarket(rpc, { refresh: true });
  const oracles = oracleAccountsFor(market);

  let done = 0;
  for (const oracle of oracles) {
    try {
      await resetAccount(env.rpcUrl, oracle);
      done += 1;
    } catch {
      /* best effort */
    }
  }

  return { done, total: oracles.length };
}

async function main(): Promise<void> {
  const watch = process.argv.includes("--watch");

  const { done, total } = await refreshOnce();
  console.log(`re-pulled ${done} of ${total} oracle accounts`);

  if (!watch) {
    console.log("Good for about half an hour. Run it again before recording.");
    return;
  }

  console.log("Watching. Re-pulling every two minutes — leave this running.");
  setInterval(() => {
    void refreshOnce()
      .then(({ done: n }) => {
        console.log(`${new Date().toLocaleTimeString()}  re-pulled ${n}`);
      })
      .catch(() => {
        /* the fork may be restarting; try again next tick */
      });
  }, WATCH_INTERVAL_MS);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
