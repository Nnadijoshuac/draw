"use client";

import { PrivyProvider } from "@privy-io/react-auth";

// Email and SMS only. A user should never see the word wallet, and never a
// seed phrase — Privy holds the key material and creates the account on login.
export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return <MissingConfig />;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "sms"],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
        appearance: {
          theme: "light",
          accentColor: "#1B4DFF",
          walletChainType: "solana-only",
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

function MissingConfig() {
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-lg font-semibold">Configuration missing</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local.
      </p>
    </main>
  );
}
