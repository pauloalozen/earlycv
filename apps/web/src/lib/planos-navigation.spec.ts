import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("planos page does not wrap content with PageShell", () => {
  const filePath = resolve(process.cwd(), "apps/web/src/app/planos/page.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.doesNotMatch(content, /import\s+\{\s*PageShell\s*\}/);
  assert.doesNotMatch(content, /<PageShell>/);
});

test("planos page uses focus remount wrapper", () => {
  const filePath = resolve(process.cwd(), "apps/web/src/app/planos/page.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /import\s+\{\s*PlanosFocusRemount\s*\}/);
  assert.match(content, /<PlanosFocusRemount>/);
});

test("planos focus remount wrapper controls local spinner transition", () => {
  const filePath = resolve(
    process.cwd(),
    "apps/web/src/app/planos/planos-focus-remount.tsx",
  );
  const content = readFileSync(filePath, "utf8");

  assert.match(
    content,
    /type\s+TransitionPhase\s*=\s*"loading"\s*\|\s*"revealing"\s*\|\s*"done"/,
  );
  assert.match(content, /route-transition-overlay/);
  assert.match(content, /route-transition-content--\$\{phase\}/);
  assert.match(content, /setFocusVersion\(/);
});
