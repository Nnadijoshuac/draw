"use client";

import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import { VersionedTransaction } from "@solana/web3.js";
import { useEffect, useMemo, useRef, useState } from "react";

export interface DrawWallet {
  /** False until Privy has hydrated. Gate every render on this. */
  ready: boolean;
  authenticated: boolean;
  /** The user's Solana address, once they have one. */
  address: string | null;
  /** Set when we could not provision a wallet at all. */
  walletError: string | null;
  login: () => void;
  logout: () => Promise<void>;
  /** Sign a base64 wire transaction. The backend co-signs and submits. */
  signTransaction: (wireTransaction: string) => Promise<string>;
}

export function useDrawWallet(): DrawWallet {
  const { ready, authenticated, login, logout } = usePrivy();
  const { ready: walletsReady, wallets, createWallet } = useSolanaWallets();
  const [walletError, setWalletError] = useState<string | null>(null);
  const attempted = useRef(false);

  const wallet = wallets[0];

  // A user who signed up before Solana was configured has an account but no
  // Solana wallet, and createOnLogin will not backfill one. Provision it here
  // so they are not left staring at an empty portfolio.
  useEffect(() => {
    if (!ready || !walletsReady || !authenticated) return;
    if (wallet || attempted.current) return;

    attempted.current = true;
    createWallet().catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      // Thrown when one already exists, which is not a problem.
      if (message.toLowerCase().includes("already")) return;
      setWalletError(message);
    });
  }, [ready, walletsReady, authenticated, wallet, createWallet]);

  return useMemo(
    () => ({
      ready: ready && walletsReady,
      authenticated,
      address: wallet?.address ?? null,
      walletError,
      login,
      logout,

      async signTransaction(wireTransaction: string) {
        if (!wallet) throw new Error("No wallet available to sign");

        // Privy speaks web3.js v1 objects while the rest of Draw is on
        // @solana/kit, so this is the one place the two meet.
        const tx = VersionedTransaction.deserialize(
          Uint8Array.from(atob(wireTransaction), (c) => c.charCodeAt(0)),
        );

        // Sign only. Draw's fee payer adds its signature server side and
        // submits, which is what keeps the user free of SOL entirely.
        const signed = await wallet.signTransaction(tx);

        return btoa(String.fromCharCode(...signed.serialize()));
      },
    }),
    [ready, walletsReady, authenticated, wallet, walletError, login, logout],
  );
}
