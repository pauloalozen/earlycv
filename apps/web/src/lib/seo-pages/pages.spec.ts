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

test("target seo pages expose page-level keywords arrays", () => {
  const targets = [
    getSeoPageBySlug("curriculo-ats"),
    getSeoPageBySlug("palavras-chave-curriculo"),
    getSeoPageBySlug("adaptar-curriculo-para-vaga"),
  ];

  for (const page of targets) {
    assert.ok(page);
    assert.ok(Array.isArray(page.seo.keywords));
    assert.ok((page.seo.keywords?.length ?? 0) > 0);
    const faq: { question: string; answer: string }[] | undefined = page.faq;
    assert.equal(faq === undefined || Array.isArray(faq), true);
  }
});

test("curriculo-ats keeps required seo contract", () => {
  const page = getSeoPageBySlug("curriculo-ats");
  assert.ok(page);

  assert.deepEqual(page.seo.keywords, [
    "currículo ats",
    "curriculo ats",
    "criar currículo ats",
    "curriculo ats modelo",
    "currículo compatível com ats",
    "ats currículo",
  ]);

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/palavras-chave-curriculo" &&
        link.label === "palavras-chave para currículo",
    ),
    true,
    "missing link to palavras-chave-curriculo",
  );

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/adaptar-curriculo-para-vaga" &&
        link.label === "adaptar currículo para cada vaga",
    ),
    true,
    "missing link to adaptar-curriculo-para-vaga",
  );

  assert.equal(page.faq?.length, 3);
});

test("palavras-chave-curriculo keeps required seo contract", () => {
  const page = getSeoPageBySlug("palavras-chave-curriculo");
  assert.ok(page);

  assert.deepEqual(page.seo.keywords, [
    "palavras chave para curriculo",
    "palavras chaves para curriculo",
    "palavras-chave currículo ats",
    "palavras chave currículo",
    "termos para currículo",
  ]);

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/curriculo-ats" &&
        link.label === "currículo compatível com ATS",
    ),
    true,
    "missing link to curriculo-ats",
  );

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/adaptar-curriculo-para-vaga" &&
        link.label === "adaptar o currículo para a vaga",
    ),
    true,
    "missing link to adaptar-curriculo-para-vaga",
  );

  assert.equal(page.faq?.length, 3);
});

test("adaptar-curriculo-para-vaga keeps required seo contract", () => {
  const page = getSeoPageBySlug("adaptar-curriculo-para-vaga");
  assert.ok(page);

  assert.deepEqual(page.seo.keywords, [
    "adaptar currículo para vaga",
    "adaptar curriculo",
    "como adaptar currículo",
    "currículo por vaga",
    "personalizar currículo",
  ]);

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/curriculo-ats" && link.label === "currículo ATS",
    ),
    true,
    "missing link to curriculo-ats",
  );

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/palavras-chave-curriculo" &&
        link.label === "palavras-chave certas",
    ),
    true,
    "missing link to palavras-chave-curriculo",
  );

  assert.equal(page.faq?.length, 3);
});
