import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Same as the app: one .env.local at the repo root, shared by everything.
loadEnv({ path: path.join(process.cwd(), "..", "..", ".env.local") });

const nextConfig: NextConfig = {
  agentRules: false,

  env: {
    NEXT_PUBLIC_DRAW_ORIGIN:
      process.env.NEXT_PUBLIC_DRAW_ORIGIN ?? "http://localhost:3000",
  },
};

export default nextConfig;
