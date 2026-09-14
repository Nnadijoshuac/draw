import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import { SURFNET_RPC_URL } from "./constants.js";

export type SolanaRpc = Rpc<SolanaRpcApi>;
export type SolanaRpcSubscriptions = RpcSubscriptions<SolanaRpcSubscriptionsApi>;

export interface ChainClient {
  rpc: SolanaRpc;
  rpcSubscriptions: SolanaRpcSubscriptions;
  rpcUrl: string;
}

export interface ChainClientOptions {
  rpcUrl?: string;
  rpcSubscriptionsUrl?: string;
}

/**
 * Derive the websocket endpoint from the http one.
 *
 * Validators — surfpool included — serve subscriptions on the RPC port plus
 * one. Hosted providers usually accept the same host over wss.
 */
export function deriveSubscriptionsUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  const secure = url.protocol === "https:";

  url.protocol = secure ? "wss:" : "ws:";

  if (!secure && url.port) {
    url.port = String(Number(url.port) + 1);
  }

  return url.toString().replace(/\/$/, "");
}

/**
 * One factory for every chain client in the codebase, so moving from the local
 * mainnet fork to live mainnet is a change of environment variable rather than
 * a change of code.
 */
export function createChainClient(options: ChainClientOptions = {}): ChainClient {
  const { rpcUrl = SURFNET_RPC_URL } = options;
  const subscriptionsUrl =
    options.rpcSubscriptionsUrl ?? deriveSubscriptionsUrl(rpcUrl);

  return {
    rpc: createSolanaRpc(rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(subscriptionsUrl),
    rpcUrl,
  };
}

/** True when we are talking to a local surfnet rather than a public cluster. */
export function isLocalCluster(rpcUrl: string): boolean {
  return rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");
}
