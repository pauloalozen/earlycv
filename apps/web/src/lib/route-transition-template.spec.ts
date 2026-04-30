import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("adaptar segment template exists and does not nest root transition", () => {
  const templatePath = resolve(currentDir, "../app/adaptar/template.tsx");

  assert.equal(
    existsSync(templatePath),
    false,
    "adaptar segment should rely on root template only",
  );
});

test("root template keeps pathname-based transition overlay", () => {
  const rootTemplatePath = resolve(currentDir, "../app/template.tsx");
  const content = readFileSync(rootTemplatePath, "utf8");

  assert.match(content, /usePathname/);
  assert.match(content, /setLoading\(true\)/);
  assert.match(content, /setTimeout\(\(\) => setLoading\(false\), 400\)/);
  assert.match(content, /route-transition-overlay/);
  assert.match(content, /\},\s*\[pathname\]\)/);
});

test("resultado page hydrates guest data in initial state", () => {
  const resultadoPagePath = resolve(
    currentDir,
    "../app/adaptar/resultado/page.tsx",
  );
  const content = readFileSync(resultadoPagePath, "utf8");

  assert.match(
    content,
    /const \[rawData, setRawData\] = useState<CvAnalysisData \| null>\(\(\) =>/,
  );
  assert.match(content, /getGuestAnalysisRaw\(/);
});

test("resultado page claims guest analysis via local API route", () => {
  const resultadoPagePath = resolve(
    currentDir,
    "../app/adaptar/resultado/page.tsx",
  );
  const content = readFileSync(resultadoPagePath, "utf8");

  assert.match(content, /\/api\/cv-adaptation\/claim-guest/);
  assert.doesNotMatch(content, /claimGuestAnalysis\(/);
});
