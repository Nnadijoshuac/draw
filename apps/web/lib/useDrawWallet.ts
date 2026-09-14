"use client";

import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import { VersionedTransaction } from "@solana/web3.js";
import { useMemo } from "react";

export interface DrawWallet {
  /** False until Privy has hydrated. Gate every render on this. */
  ready: boolean;
  authenticated: boolean;
  /** The user's Solana address, once they have one. */
  address: string | null;
  login: () => void;
  logout: () => Promise<void>;
  /** Sign a base64 wire transaction. The backend co-signs and submits. */
  signTransaction: (wireTransaction: string) => Promise<string>;
}

export function useDrawWallet(): DrawWallet {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useSolanaWallets();

  const wallet = wallets[0];

  return useMemo(
    () => ({
      ready,
      authenticated,
      address: wallet?.address ?? null,
      login,
      logout,

      async signTransaction(wireTransaction: string) {
        if (!wallet) throw new Error("No wallet available to sign");

        // Privy speaks web3.js v1 objects while the rest of Draw is on
        // @solana/kit, so this is the one place the two meet. Deserialize,
        // sign, hand the bytes back.
        const tx = VersionedTransaction.deserialize(
          Uint8Array.from(atob(wireTransaction), (c) => c.charCodeAt(0)),
        );

        // Sign only. Draw's fee payer adds its signature server side and
        // submits, which is what keeps the user free of SOL entirely.
        const signed = await wallet.signTransaction(tx);

        return btoa(String.fromCharCode(...signed.serialize()));
      },
    }),
    [ready, authenticated, wallet, login, logout],
  );
}

