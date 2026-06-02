import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("AppHeader exposes Meu Perfil in the global menu", () => {
  const filePath = resolve(currentDir, "app-header.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /label: "Meu Perfil"/g);
  assert.match(content, /href: "\/dashboard"/g);
  assert.doesNotMatch(content, /label: "Meu CV Master"/);
});
