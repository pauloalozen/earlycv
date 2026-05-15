import assert from "node:assert/strict";
import { test } from "node:test";

import nextConfig from "../next.config";

test("security headers include hardened baseline", async () => {
  const entries = await nextConfig.headers?.();
  assert.ok(entries);

  const globalRule = entries.find((entry) => entry.source === "/(.*)");
  assert.ok(globalRule);

  const values = new Map(
    globalRule.headers.map((header) => [header.key, header.value]),
  );

  assert.equal(values.get("X-Frame-Options"), "SAMEORIGIN");
  assert.equal(values.get("X-Content-Type-Options"), "nosniff");
  assert.equal(
    values.get("Referrer-Policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(
    values.get("Strict-Transport-Security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(
    values.get("Permissions-Policy"),
    "camera=(), microphone=(), geolocation=()",
  );

  const cspReportOnly = values.get("Content-Security-Policy-Report-Only");
  assert.ok(cspReportOnly);
  assert.match(cspReportOnly, /frame-ancestors 'self'/);
  assert.match(cspReportOnly, /object-src 'none'/);
  assert.match(cspReportOnly, /https:\/\/c\.earlycv\.com\.br/);
});

test("admin surfaces receive noindex x-robots-tag", async () => {
  const entries = await nextConfig.headers?.();
  assert.ok(entries);

  const adminRule = entries.find((entry) => entry.source === "/admin/:path*");
  const superadminRule = entries.find(
    (entry) => entry.source === "/superadmin/:path*",
  );

  assert.deepEqual(adminRule?.headers, [
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ]);
  assert.deepEqual(superadminRule?.headers, [
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ]);
});
