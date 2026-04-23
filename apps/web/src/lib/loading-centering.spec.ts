import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("route loading blocks keep spinners vertically centered", () => {
  const resultadoPagePath = resolve(
    currentDir,
    "../app/adaptar/resultado/page.tsx",
  );
  const meusCvsPagePath = resolve(currentDir, "../app/cv-base/page.tsx");

  const resultadoPage = readFileSync(resultadoPagePath, "utf8");
  const meusCvsPage = readFileSync(meusCvsPagePath, "utf8");

  assert.match(
    resultadoPage,
    /if \(!rawData\)[\s\S]*position:\s*"fixed"[\s\S]*alignItems:\s*"center"[\s\S]*justifyContent:\s*"center"/,
  );
  assert.match(meusCvsPage, /min-h-\[200px\] items-center justify-center/);
});
