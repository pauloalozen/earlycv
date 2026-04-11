import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("adaptar upload box keeps stable height and truncates filename", () => {
  const pagePath = resolve(currentDir, "../app/adaptar/page.tsx");
  const content = readFileSync(pagePath, "utf8");

  assert.match(content, /min-h-\[154px\]/);
  assert.match(content, /max-w-\[220px\] truncate/);
});
