import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build step, so
  // Next compiles them alongside the app.
  transpilePackages: ["@draw/core", "@draw/shared"],

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
