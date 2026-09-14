import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next only reads .env.local from its own directory, but ours lives at the
// repo root so the chain scripts and both apps share one file.
loadEnv({ path: path.join(process.cwd(), "..", "..", ".env.local") });

const nextConfig: NextConfig = {
  // Don't scatter generated tooling files through the app directory.
  agentRules: false,

  // NEXT_PUBLIC_ values are inlined at build time from Next's own env loading,
  // which never saw the root file. Pass them through explicitly.
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL ?? "",
    NEXT_PUBLIC_XSTOCK_MINT: process.env.NEXT_PUBLIC_XSTOCK_MINT ?? "",
    NEXT_PUBLIC_USDC_MINT: process.env.NEXT_PUBLIC_USDC_MINT ?? "",
  },

  // Workspace packages ship TypeScript source rather than a build step, so
  // Next compiles them alongside the app.
  transpilePackages: ["@draw/core", "@draw/shared"],

  // Kamino's dependency tree reaches a WASM binary that only resolves from a
  // real node_modules path. Bundling it rewrites the path and the load fails,
  // so these stay external and load at runtime.
  serverExternalPackages: [
    "@kamino-finance/klend-sdk",
    "@kamino-finance/kliquidity-sdk",
    "@kamino-finance/scope-sdk",
    "@kamino-finance/farms-sdk",
    "@orca-so/whirlpools-core",
  ],

  async headers() {
    return [
      {
        // The checkout runs inside a popup opened by a merchant site, so it
        // must not be blanket-denied from framing contexts. Everything else
        // stays locked down.
        source: "/checkout",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The embed script is loaded cross-origin by merchants by design.
        source: "/v1/draw.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
