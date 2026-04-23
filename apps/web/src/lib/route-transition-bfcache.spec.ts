import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("root template uses pathname-driven transition and tracker provider", () => {
  const templatePath = resolve(currentDir, "../app/template.tsx");
  const content = readFileSync(templatePath, "utf8");

  assert.match(content, /usePathname/);
  assert.match(content, /JourneyTrackerProvider/);
  assert.match(content, /setTimeout\(\(\) => setLoading\(false\), 400\)/);
  assert.match(content, /route-transition-overlay/);
});
