import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't scatter generated tooling files through the app directory.
  agentRules: false,

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
