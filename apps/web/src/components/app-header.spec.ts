import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("AppHeader exposes Meu Perfil in the global menu", () => {
  // Itens do menu do usuário foram extraídos para app-header-user-menu.tsx
  // num refactor anterior — o teste ainda checava app-header.tsx.
  const filePath = resolve(currentDir, "app-header-user-menu.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /label: "Meu Perfil"/g);
  assert.match(content, /href: "\/meu-perfil"/g);
  assert.doesNotMatch(content, /label: "Meu CV Master"/);
});
