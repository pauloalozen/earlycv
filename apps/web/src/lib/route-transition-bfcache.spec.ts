import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("root template always releases transition overlay on pageshow", () => {
  const templatePath = resolve(process.cwd(), "apps/web/src/app/template.tsx");
  const content = readFileSync(templatePath, "utf8");

  assert.match(content, /addEventListener\("pageshow"/);
  assert.match(content, /addEventListener\("popstate"/);
  assert.match(content, /navigation.*back_forward/);
  assert.match(content, /setPhase\("done"\)/);
  assert.doesNotMatch(content, /if \(e\.persisted\)/);
});
