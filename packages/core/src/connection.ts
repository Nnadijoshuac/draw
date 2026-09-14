import { Connection, type Commitment } from "@solana/web3.js";
import { SURFNET_RPC_URL } from "./constants.js";

export interface ConnectionOptions {
  rpcUrl?: string;
  commitment?: Commitment;
}

/**
 * Everything reads and writes through one connection factory so the cluster is
 * a single configuration change. Pointing at live mainnet should never require
 * touching anything but the RPC url.
 */
export function createConnection(options: ConnectionOptions = {}): Connection {
  const { rpcUrl = SURFNET_RPC_URL, commitment = "confirmed" } = options;

  return new Connection(rpcUrl, {
    commitment,
    // Surfpool is local, so the usual 30s default is longer than useful.
    confirmTransactionInitialTimeout: 45_000,
  });
}

/** True when we are talking to a local surfnet rather than a public cluster. */
export function isLocalCluster(rpcUrl: string): boolean {
  return rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");
}
