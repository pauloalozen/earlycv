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
  assert.equal(published.length, 5);
  assert.equal(
    published.every((page) => page.published),
    true,
  );
});

test("keyword hub keeps minimum quantitative structure", () => {
  const hub = getSeoPageBySlug("palavras-chave-curriculo");
  assert.ok(hub);
  assert.equal(hub.pageType, "hub");
  assert.ok(hub.keywordGroups);

  for (const group of hub.keywordGroups ?? []) {
    assert.ok(group.roles.length >= 2);
    for (const role of group.roles) {
      assert.ok(role.keywords.length >= 8);
      for (const keyword of role.keywords) {
        assert.ok(keyword.term.length > 0);
        assert.ok(keyword.whereToUse.length > 0);
        assert.ok(keyword.whenItMakesSense.length > 0);
      }
    }
  }
});

test("seo slug guard blocks unknown values", () => {
  assert.equal(isSeoPageSlug("curriculo-ats"), true);
  assert.equal(isSeoPageSlug("blog"), false);
  assert.equal(getSeoPageBySlug("blog"), null);
});
