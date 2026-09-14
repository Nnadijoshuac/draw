import { createChainClient, type ChainClient } from "@draw/core";
import { publicEnv } from "./env";

/**
 * One chain client per process.
 *
 * Kamino's market load pulls a lot of accounts, and the adapter caches it, so
 * sharing the client across requests is the difference between a quote that
 * feels instant and one that refetches the whole market every time.
 */

let client: ChainClient | null = null;

export function chain(): ChainClient {
  if (!client) {
    client = createChainClient({ rpcUrl: publicEnv.rpcUrl });
  }
  return client;
}
