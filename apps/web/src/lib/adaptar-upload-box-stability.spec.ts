import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("adaptar upload box keeps stable height and truncates filename", () => {
  // page.tsx virou um wrapper de servidor fino (redirects/gate) num
  // refactor anterior — a UI da caixa de upload está em adaptar-client.tsx.
  const pagePath = resolve(currentDir, "../app/adaptar/adaptar-client.tsx");
  const content = readFileSync(pagePath, "utf8");

  assert.match(content, /padding:\s*"35px 20px"/);
  assert.match(content, /\{file\.name\}/);
});
