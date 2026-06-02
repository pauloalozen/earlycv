import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("CV base upload redirects first-time saves to Meu CV Master", () => {
  const filePath = resolve(currentDir, "page.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /const isFirstMasterUpload = !masterResume;/);
  assert.match(content, /router\.push\("\/meu-cv-master"\);/);
  assert.match(content, /href="\/meu-perfil"/);
  assert.match(content, /← Meu Perfil/);
});
