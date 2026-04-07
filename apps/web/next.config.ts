import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const workspaceRootCandidates = [
  fileURLToPath(new URL("../..", import.meta.url)),
  fileURLToPath(new URL("../../../../", import.meta.url)),
];

const workspaceRoot =
  workspaceRootCandidates.find((candidate) =>
    existsSync(`${candidate}/node_modules/next/package.json`),
  ) ?? workspaceRootCandidates[0];

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
