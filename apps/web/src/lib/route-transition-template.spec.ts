import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("adaptar segment has its own template transition wrapper", () => {
  const templatePath = resolve(currentDir, "../app/adaptar/template.tsx");

  assert.equal(
    existsSync(templatePath),
    true,
    "adapatar template should exist",
  );

  const content = readFileSync(templatePath, "utf8");
  assert.match(content, /from\s+"\.\.\/template"/);
  assert.match(content, /<RootTemplate>{children}<\/RootTemplate>/);
});

test("root template skips spinner on landing route", () => {
  const rootTemplatePath = resolve(currentDir, "../app/template.tsx");
  const content = readFileSync(rootTemplatePath, "utf8");

  assert.match(content, /usePathname/);
  assert.match(content, /pathname\s*===\s*"\/"/);
  assert.match(content, /setPhase\("loading"\)/);
});

test("resultado page hydrates guest data in initial state", () => {
  const resultadoPagePath = resolve(
    currentDir,
    "../app/adaptar/resultado/page.tsx",
  );
  const content = readFileSync(resultadoPagePath, "utf8");

  assert.match(
    content,
    /const \[data, setData\] = useState<CvAnalysisData \| null>\(\(\) =>/,
  );
  assert.match(content, /sessionStorage\.getItem\("guestAnalysis"\)/);
});
