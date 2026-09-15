import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";
import { collectSharedDrawAccounts, createChainClient } from "@draw/core";
import { env } from "./env";
import { isRefreshable, resetAccount, streamAccount } from "./surfnet";

/**
 * Re-pull the reserves and oracles from mainnet.
 *
 * A fork clones an oracle once and the local clock keeps moving, so after
 * about half an hour Kamino rejects every borrow with ReserveStale. This fixes
 * that in seconds without restarting the fork, which means the lookup table
 * and every funded wallet survive.
 *
 *   pnpm refresh
 */

async function main(): Promise<void> {
  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });

  const feePayer = await createKeyPairSignerFromBytes(
    new Uint8Array(getBase58Encoder().encode(process.env.FEE_PAYER_SECRET_KEY ?? "")),
  );

  const accounts = await collectSharedDrawAccounts({
    rpc,
    userA: feePayer.address,
    userB: feePayer.address,
    merchant: feePayer.address,
    collateralMint: env.collateralMint,
    debtMint: env.debtMint,
    collateralAmount: 100_000_000n,
    borrowAmount: 1_000_000n,
    feePayer: feePayer.address,
  });

  let refreshed = 0;
  let streaming = 0;

  for (const account of accounts.filter(isRefreshable)) {
    try {
      await resetAccount(env.rpcUrl, account);
      refreshed += 1;
    } catch {
      /* best effort */
    }
    try {
      await streamAccount(env.rpcUrl, account);
      streaming += 1;
    } catch {
      /* best effort */
    }
  }

  console.log(`re-pulled ${refreshed} accounts, streaming ${streaming}`);
  console.log("Prices are current again. No restart needed.");
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
