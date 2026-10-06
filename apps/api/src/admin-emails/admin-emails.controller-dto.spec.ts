import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Regressão: um `import type` de DTO faz o Nest ver `Object` como metatype e o
// ValidationPipe global rejeita todo campo ("property x should not exist").
// (tsx não emite design:paramtypes, então a checagem é no código-fonte.)
test("DTOs do controller são importados como valor, nunca `import type`", () => {
  const source = readFileSync(
    join(__dirname, "admin-emails.controller.ts"),
    "utf8",
  );
  const typeOnly = source
    .split("\n")
    .filter((line) => /^import type .*\/dto\//.test(line));
  assert.deepEqual(typeOnly, []);
  assert.match(source, /^import \{ ListEmailDispatchesQueryDto \}/m);
});
