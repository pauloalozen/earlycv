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

const isProduction = process.env.NODE_ENV === "production";

const cspReportOnlyDirectives = [
  "default-src 'self'",
  [
    "script-src 'self' 'unsafe-inline'",
    isProduction ? "" : "'unsafe-eval'",
    "https://challenges.cloudflare.com",
    "https://www.googletagmanager.com",
    "https://sdk.mercadopago.com",
  ]
    .filter(Boolean)
    .join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  [
    "connect-src 'self'",
    "https://app.posthog.com",
    "https://eu.posthog.com",
    "https://us.i.posthog.com",
    "https://eu.i.posthog.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://www.googletagmanager.com",
    "https://*.mercadopago.com",
  ].join(" "),
  [
    "frame-src",
    "https://challenges.cloudflare.com",
    "https://*.mercadopago.com",
  ].join(" "),
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.mercadopago.com",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: cspReportOnlyDirectives,
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
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
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/superadmin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
