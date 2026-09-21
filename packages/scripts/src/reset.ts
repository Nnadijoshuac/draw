import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  address,
  createKeyPairSignerFromBytes,
  getBase58Encoder,
} from "@solana/kit";
import { createChainClient, getTokenProgram, loadMarket } from "@draw/core";
import { env } from "./env";
import { createDrawLookupTable } from "./lut";
import { oracleAccountsFor } from "./oracles";
import { resetAccount, setLamports, setTokenBalance } from "./surfnet";

/**
 * Put the fork back into a state where a payment works.
 *
 * Kamino refuses to borrow against stale oracle prices, and a fork's cloned
 * oracles go stale after roughly half an hour. Restarting re-clones them, but
 * that wipes the lookup table and every funded wallet too, so all three steps
 * have to happen together.
 *
 *   pnpm reset [wallet-to-fund]
 */

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ENV_FILE = `${REPO_ROOT}.env.local`;
const USDC_AMOUNT = 10_000_000_000n;
const COLLATERAL_AMOUNT = 50_000_000_000n;
const FEE_PAYER_LAMPORTS = 100_000_000_000;

const isWindows = process.platform === "win32";

// shell: true. Without it the backgrounding operators in the command below are
// passed to wsl as literal arguments and nothing starts.
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", shell: true });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

async function isForkHealthy(rpcUrl: string): Promise<boolean> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Kamino rejects a price older than max_age, and it measures that against the
 * fork's clock rather than ours. Surfpool produces slots slightly faster than
 * mainnet's real average, so a fork left running for a day ends up minutes
 * ahead — and a freshly pulled mainnet oracle is then born already expired.
 *
 * Re-pulling cannot fix that. Only a restart resets the clock.
 */
const MAX_CLOCK_DRIFT_SECONDS = 120;

async function clockDriftSeconds(rpc: ReturnType<typeof createChainClient>["rpc"]) {
  const slot = await rpc.getSlot().send();
  const blockTime = await rpc.getBlockTime(slot).send();
  return Number(blockTime) - Math.floor(Date.now() / 1000);
}

async function restartFork(): Promise<void> {
  const script = `${REPO_ROOT}packages/scripts/start-surfnet.sh`.replace(
    /^([A-Za-z]):/,
    (_m, drive: string) => `/mnt/${drive.toLowerCase()}`,
  );
  const unixScript = script.replace(/\\/g, "/");

  if (isWindows) {
    // nohup and disown, not a detached spawn. WSL tears down the processes it
    // started as soon as the launching invocation exits, so a plain spawn
    // gives you a fork that dies the moment this script finishes.
    //
    // Two things here are load-bearing and neither is obvious.
    //
    // -u root: surfpool installs to /root/.local and runs as root, so as the
    // default user pkill matches nothing and the old fork keeps serving — a
    // restart that appears to succeed and changes nothing.
    //
    // pkill -x, matching the process name, not -f, matching the whole command
    // line. This shell's own command line contains the word surfpool, so -f
    // kills the shell mid-command and the restart never runs.
    await run("wsl", [
      "-d",
      "Ubuntu",
      "-u",
      "root",
      "--",
      "bash",
      "-lc",
      `pkill -x surfpool || true; sleep 2; nohup bash ${unixScript} > /tmp/surfpool.log 2>&1 & disown; sleep 3`,
    ]);
  } else {
    await run("bash", [
      "-lc",
      `pkill -x surfpool || true; sleep 2; nohup bash ${REPO_ROOT}packages/scripts/start-surfnet.sh > /tmp/surfpool.log 2>&1 & disown; sleep 3`,
    ]);
  }
}

async function waitForRpc(rpcUrl: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`surfnet never answered on ${rpcUrl}`);
}

function writeEnvValue(key: string, value: string): void {
  const current = readFileSync(ENV_FILE, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  writeFileSync(
    ENV_FILE,
    pattern.test(current) ? current.replace(pattern, line) : `${current}\n${line}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  const [walletArg] = process.argv.slice(2);

  // Re-pulling the oracles is usually enough, so a running fork does not need
  // to be torn down — restarting throws away every funded wallet. The exception
  // is clock drift, which re-pulling cannot help with at all.
  let running = await isForkHealthy(env.rpcUrl);

  if (running) {
    const drift = await clockDriftSeconds(
      createChainClient({ rpcUrl: env.rpcUrl }).rpc,
    );

    if (drift > MAX_CLOCK_DRIFT_SECONDS) {
      console.log(`fork clock is ${drift}s ahead of real time`);
      console.log("  every price we pull would arrive already expired");
      console.log("  restarting, which clears funded wallets");
      running = false;
    } else {
      console.log(`fork already running, keeping it (clock ${drift}s off)`);
    }
  }

  if (!running) {
    console.log("starting the fork");
    await restartFork();
    await waitForRpc(env.rpcUrl);
    console.log("  fork up");
  }

  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });

  const feePayer = await createKeyPairSignerFromBytes(
    new Uint8Array(getBase58Encoder().encode(process.env.FEE_PAYER_SECRET_KEY ?? "")),
  );
  await setLamports(env.rpcUrl, feePayer.address, FEE_PAYER_LAMPORTS);
  console.log(`  fee payer funded ${feePayer.address}`);

  console.log("rebuilding the lookup table");
  const { table, accounts } = await createDrawLookupTable({
    rpc,
    authority: feePayer,
    collateralMint: env.collateralMint,
    debtMint: env.debtMint,
  });
  writeEnvValue("DRAW_LOOKUP_TABLE", table);

  // Oracles only. Re-pulling a reserve or a vault would overwrite it with
  // mainnet state and erase every deposit made on this fork.
  const { market } = await loadMarket(rpc, { refresh: true });
  const oracles = oracleAccountsFor(market);
  let pulled = 0;
  for (const oracle of oracles) {
    try {
      // Re-pull only. Streaming these keeps them fresh for RPC reads while
      // leaving the runtime reading an empty account — see refresh.ts.
      await resetAccount(env.rpcUrl, oracle);
      pulled += 1;
    } catch {
      /* best effort */
    }
  }
  console.log(`  re-pulled ${pulled} price accounts`);

  // The running server reads this file per request, so a reset does not need
  // a dev server restart to take effect.
  mkdirSync(`${REPO_ROOT}.draw`, { recursive: true });
  writeFileSync(`${REPO_ROOT}.draw/lookup-table`, table, "utf8");

  if (walletArg) {
    console.log(`funding ${walletArg}`);
    const wallet = address(walletArg);
    for (const [mint, amount] of [
      [env.debtMint, USDC_AMOUNT],
      [env.collateralMint, COLLATERAL_AMOUNT],
    ] as const) {
      const tokenProgram = await getTokenProgram(rpc, mint);
      await setTokenBalance(env.rpcUrl, { owner: wallet, mint, amount, tokenProgram });
    }
    console.log("  10,000 USDC and 500 shares");
  }

  console.log("\nReady. Restart the dev server so it picks up the new lookup table.");
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
