import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("dashboard page mounts GuestAnalysisClaimer for guest persistence recovery", () => {
  const pagePath = resolve(process.cwd(), "src/app/dashboard/page.tsx");
  const content = readFileSync(pagePath, "utf8");

  assert.match(
    content,
    /import\s+\{\s*GuestAnalysisClaimer\s*\}\s+from\s+"\.\/guest-analysis-claimer"/,
  );
  assert.match(content, /<GuestAnalysisClaimer\s*\/>/);
});

test("dashboard page removes legacy analysis history block and links to candidaturas page", () => {
  const pagePath = resolve(process.cwd(), "src/app/dashboard/page.tsx");
  const content = readFileSync(pagePath, "utf8");

  assert.doesNotMatch(content, /Hist[oó]rico de An[aá]lises/);
  assert.match(content, /Suas candidaturas/);
  assert.match(
    content,
    /href="\/dashboard\/candidaturas"[^>]*>\s*Ver todas as candidaturas/,
  );
});
