import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getAllSeoPages,
  getPublishedSeoPages,
  getSeoPageBySlug,
  isSeoPageSlug,
} from "./pages";

test("seo registry keeps unique slugs and canonical paths", () => {
  const pages = getAllSeoPages();
  const slugs = pages.map((page) => page.slug);
  const unique = new Set(slugs);

  assert.equal(unique.size, slugs.length);
  for (const page of pages) {
    assert.equal(page.path, `/${page.slug}`);
  }
});

test("seo registry returns only published pages for static generation", () => {
  const published = getPublishedSeoPages();
  assert.equal(published.length, 4);
  assert.equal(
    published.every((page) => page.published),
    true,
  );
});

test("seo slug guard blocks unknown values", () => {
  assert.equal(isSeoPageSlug("curriculo-ats"), true);
  assert.equal(isSeoPageSlug("blog"), false);
  assert.equal(getSeoPageBySlug("blog"), null);
});
