import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CLAUDE.md in this repo is the design standards document, authored by the
  // project owner. next dev otherwise appends its own block to it on every
  // run, leaving a permanent uncommitted diff in a file it does not own.
  agentRules: false,
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Server Actions receive the .numbers upload; the parser sidecar does the work.
    serverActions: { bodySizeLimit: "32mb" },
  },
};

export default nextConfig;
