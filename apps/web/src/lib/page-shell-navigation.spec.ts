import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("PageShell handles back-forward restore without timeout gating", () => {
  const filePath = resolve(
    process.cwd(),
    "apps/web/src/components/page-shell.tsx",
  );
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /addEventListener\("pageshow"/);
  assert.doesNotMatch(content, /setTimeout\(/);
});
