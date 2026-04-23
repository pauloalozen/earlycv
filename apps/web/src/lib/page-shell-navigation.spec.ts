import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("PageShell listens to pageshow and uses a short reveal timeout", () => {
  const filePath = resolve(currentDir, "../components/page-shell.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /addEventListener\("pageshow"/);
  assert.match(content, /setTimeout\(\(\) => setReady\(true\), 100\)/);
});
