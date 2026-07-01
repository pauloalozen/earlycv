import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("meu-perfil page mounts GuestAnalysisClaimer for guest persistence recovery", () => {
  const pagePath = resolve(process.cwd(), "src/app/meu-perfil/page.tsx");
  const content = readFileSync(pagePath, "utf8");

  assert.match(
    content,
    /import\s+\{\s*GuestAnalysisClaimer\s*\}\s+from\s+"\.\.\/dashboard\/guest-analysis-claimer"/,
  );
  assert.match(content, /<GuestAnalysisClaimer\s*\/>/);
});
