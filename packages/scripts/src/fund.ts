import { address } from "@solana/kit";
import { env } from "./env.js";
import { assertSurfnet, setLamports, setTokenBalance } from "./surfnet.js";

/**
 * Hand a wallet everything it needs to exercise a draw end to end.
 *
 * Run it again whenever surfnet restarts — the fork keeps no state between
 * runs, and rediscovering that at demo time is a bad afternoon.
 *
 *   pnpm fund <wallet-address> [fee-payer-address]
 */

const USDC_AMOUNT = 10_000_000_000n; // 10,000 USDC at 6 decimals
const COLLATERAL_AMOUNT = 50_000_000_000n; // generous; exact decimals vary by asset
const FEE_PAYER_LAMPORTS = 100_000_000_000; // 100 SOL

async function main(): Promise<void> {
  const [walletArg, feePayerArg] = process.argv.slice(2);

  if (!walletArg) {
    console.error("Usage: pnpm fund <wallet-address> [fee-payer-address]");
    process.exit(1);
  }

  const wallet = address(walletArg);
  const { rpcUrl, collateralMint, debtMint } = env;

  await assertSurfnet(rpcUrl);

  if (feePayerArg) {
    await setLamports(rpcUrl, address(feePayerArg), FEE_PAYER_LAMPORTS);
    console.log(`  SOL      ${feePayerArg} (fee payer)`);
  }

  await setTokenBalance(rpcUrl, {
    owner: wallet,
    mint: debtMint,
    amount: USDC_AMOUNT,
  });
  console.log(`  USDC     10,000`);

  await setTokenBalance(rpcUrl, {
    owner: wallet,
    mint: collateralMint,
    amount: COLLATERAL_AMOUNT,
  });
  console.log(`  ${collateralMint}`);

  console.log(`\nFunded ${wallet} on ${rpcUrl}`);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
