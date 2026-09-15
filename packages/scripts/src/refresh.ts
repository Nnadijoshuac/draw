import { createChainClient, loadMarket } from "@draw/core";
import { env } from "./env";
import { oracleAccountsFor } from "./oracles";
import { streamAccount } from "./surfnet";

/**
 * Keep oracle prices current.
 *
 * A fork clones an oracle once and the local clock keeps moving, so after
 * about half an hour Kamino rejects every borrow with ReserveStale.
 *
 * Only the price accounts are touched. Re-pulling a reserve or its vaults
 * would overwrite them with mainnet state and erase every deposit made on the
 * fork, which looks exactly like data loss because it is.
 *
 *   pnpm refresh
 */

async function main(): Promise<void> {
  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });
  const { market } = await loadMarket(rpc, { refresh: true });

  const oracles = oracleAccountsFor(market);

  let streaming = 0;
  for (const oracle of oracles) {
    try {
      await streamAccount(env.rpcUrl, oracle);
      streaming += 1;
    } catch {
      /* best effort */
    }
  }

  console.log(`streaming ${streaming} of ${oracles.length} oracle accounts`);
  console.log("Prices stay current from here. No restart needed.");
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
