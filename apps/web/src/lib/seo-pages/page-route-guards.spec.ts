import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("seo route uses strict registry lookup and notFound", () => {
  const filePath = resolve(currentDir, "../../app/(seo)/[slug]/page.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /generateStaticParams/);
  assert.match(content, /getPublishedSeoPages/);
  assert.match(content, /getSeoPageBySlug/);
  assert.match(content, /notFound\(\)/);
});

test("seo route renders FAQ JSON-LD only when faq exists", () => {
  const filePath = resolve(currentDir, "../../app/(seo)/[slug]/page.tsx");
  const content = readFileSync(filePath, "utf8");

  assert.match(content, /faqJsonLd = page\.faq\?\.length/);
});
