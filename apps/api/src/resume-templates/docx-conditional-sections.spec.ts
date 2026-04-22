import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { wrapOptionalDocxSections } from "./docx-conditional-sections";

describe("wrapOptionalDocxSections", () => {
  it("wraps certifications section with hasCertificacoes conditional", () => {
    const xml =
      "<w:p><w:r><w:t>CERTIFICAÇÕES</w:t></w:r></w:p><w:p><w:r><w:t>{#certificacoes}</w:t></w:r></w:p><w:p><w:r><w:t>{courseName}</w:t></w:r></w:p><w:p><w:r><w:t>{/certificacoes}</w:t></w:r></w:p>";

    const result = wrapOptionalDocxSections(xml);

    assert.equal(result.changed, true);
    assert.match(result.xml, /\{#hasCertificacoes\}/);
    assert.match(result.xml, /\{\/hasCertificacoes\}/);
  });

  it("wraps languages section with hasIdiomas conditional", () => {
    const xml =
      "<w:p><w:r><w:t>IDIOMAS</w:t></w:r></w:p><w:p><w:r><w:t>{#idiomas}</w:t></w:r></w:p><w:p><w:r><w:t>{language}</w:t></w:r></w:p><w:p><w:r><w:t>{/idiomas}</w:t></w:r></w:p>";

    const result = wrapOptionalDocxSections(xml);

    assert.equal(result.changed, true);
    assert.match(result.xml, /\{#hasIdiomas\}/);
    assert.match(result.xml, /\{\/hasIdiomas\}/);
  });

  it("wraps languages section when heading is lowercase", () => {
    const xml =
      "<w:p><w:r><w:t>idiomas</w:t></w:r></w:p><w:p><w:r><w:t>{#idiomas}</w:t></w:r></w:p><w:p><w:r><w:t>{language}</w:t></w:r></w:p><w:p><w:r><w:t>{/idiomas}</w:t></w:r></w:p>";

    const result = wrapOptionalDocxSections(xml);

    assert.equal(result.changed, true);
    assert.match(result.xml, /\{#hasIdiomas\}/);
    assert.match(result.xml, /\{\/hasIdiomas\}/);
  });

  it("still wraps idiomas when hasIdiomas tags exist elsewhere", () => {
    const xml =
      "<w:p><w:r><w:t>{#hasIdiomas}</w:t></w:r></w:p><w:p><w:r><w:t>outro bloco</w:t></w:r></w:p><w:p><w:r><w:t>{/hasIdiomas}</w:t></w:r></w:p><w:p><w:r><w:t>IDIOMAS</w:t></w:r></w:p><w:p><w:r><w:t>{#idiomas}</w:t></w:r></w:p><w:p><w:r><w:t>{language}</w:t></w:r></w:p><w:p><w:r><w:t>{/idiomas}</w:t></w:r></w:p>";

    const result = wrapOptionalDocxSections(xml);

    assert.equal(result.changed, true);
    assert.match(result.xml, /\{#hasIdiomas\}.*\{#hasIdiomas\}/s);
  });

  it("does not duplicate wrappers when already present", () => {
    const xml =
      "<w:p><w:r><w:t>{#hasIdiomas}</w:t></w:r></w:p><w:p><w:r><w:t>IDIOMAS</w:t></w:r></w:p><w:p><w:r><w:t>{#idiomas}</w:t></w:r></w:p><w:p><w:r><w:t>{/idiomas}</w:t></w:r></w:p><w:p><w:r><w:t>{/hasIdiomas}</w:t></w:r></w:p>";

    const result = wrapOptionalDocxSections(xml);

    assert.equal(result.changed, false);
    assert.equal(result.xml, xml);
  });
});
