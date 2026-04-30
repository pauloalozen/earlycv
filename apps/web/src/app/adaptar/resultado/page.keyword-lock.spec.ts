import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("resultado locks missing keyword checkboxes when adaptation is already released", () => {
  const pagePath = resolve(process.cwd(), "src/app/adaptar/resultado/page.tsx");
  const content = readFileSync(pagePath, "utf8");

  assert.match(
    content,
    /disabled=\{isKeywordSelectionLocked\}/,
  );
  assert.match(
    content,
    /reviewAdaptationId !== null && reviewPaymentStatus === "completed"/,
  );
  assert.match(content, /title=\{\s*isKeywordSelectionLocked/);
});

test("resultado hides CTA download buttons while release popup is open", () => {
  const pagePath = resolve(process.cwd(), "src/app/adaptar/resultado/page.tsx");
  const content = readFileSync(pagePath, "utf8");

  assert.match(content, /\{isDownloadReady && !releaseModalOpen \? \(/);
});
