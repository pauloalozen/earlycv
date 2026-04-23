import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("planos page does not wrap content with PageShell", () => {
  const filePath = resolve(currentDir, "../app/planos/page.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.doesNotMatch(content, /import\s+\{\s*PageShell\s*\}/);
  assert.doesNotMatch(content, /<PageShell>/);
});

test("planos page renders score indicator and plan catalog", () => {
  const filePath = resolve(currentDir, "../app/planos/page.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /buildPlanCatalog/);
  assert.match(content, /<ScoreIndicator\s*\/?>/);
});
