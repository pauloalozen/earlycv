import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
