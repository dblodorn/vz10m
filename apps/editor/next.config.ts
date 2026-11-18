import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The engine package is consumed from its TypeScript source inside the workspace (its exports point at src/).
  transpilePackages: ["@dblodorn/casio-vz-engine"],
  // Compiles `graphql` tagged literals (react-relay) into imports of the artifacts `pnpm relay` writes to
  // `__generated__/` beside each file. Mirrors relay.config.json; the two must agree.
  compiler: {
    relay: { src: ".", language: "typescript", eagerEsModules: true },
  },
};

export default nextConfig;
