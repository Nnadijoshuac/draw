import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Next 16 dropped `next lint`, so ESLint is invoked directly and the config
// lives here. eslint-config-next ships flat configs natively from v16 — going
// through FlatCompat instead throws a circular-structure error, and ESLint 10
// breaks eslint-plugin-react outright, hence the 9.x pin in package.json.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "convex/_generated/**",
      // The built embed. Minified output is not ours to lint.
      "public/v1/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Warn, not error. The rule is right that syncing state inside an effect
      // can cascade, but every instance here is a deliberate reset when a prop
      // flips — a sheet clearing its PIN, a field clearing a checked address —
      // in components that are shipped and tested. Rewriting them to satisfy a
      // style rule is a worse trade than leaving the signal visible.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
