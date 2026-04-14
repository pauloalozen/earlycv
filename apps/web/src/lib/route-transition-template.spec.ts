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
    true,
    "adapatar template should exist",
  );

  const content = readFileSync(templatePath, "utf8");
  assert.match(content, /export default function AdaptarTemplate/);
  assert.match(content, /return children;/);
  assert.doesNotMatch(content, /from\s+"\.\.\/template"/);
});

test("root template skips spinner on landing route", () => {
  const rootTemplatePath = resolve(currentDir, "../app/template.tsx");
  const content = readFileSync(rootTemplatePath, "utf8");

  assert.match(content, /usePathname/);
  assert.match(content, /function shouldSkipRouteTransition/);
  assert.match(content, /pathname\s*===\s*"\/"/);
  assert.match(content, /route-transition-overlay/);
  assert.match(content, /setPhase\("loading"\)/);
  assert.match(content, /setPhase\("revealing"\)/);
  assert.match(content, /SAFETY_TIMEOUT_MS/);
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
    /const \[data, setData\] = useState<CvAnalysisData \| null>\(\(\) =>/,
  );
  assert.match(content, /sessionStorage\.getItem\("guestAnalysis"\)/);
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
