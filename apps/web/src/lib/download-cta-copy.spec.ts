import assert from "node:assert/strict";
import { test } from "node:test";

import { getDownloadCtaCopy } from "./download-cta-copy";

test("getDownloadCtaCopy returns idle labels", () => {
  assert.equal(getDownloadCtaCopy("pdf", null), "Baixar PDF");
  assert.equal(getDownloadCtaCopy("docx", null), "Baixar DOCX");
});

test("getDownloadCtaCopy returns loading labels", () => {
  assert.equal(getDownloadCtaCopy("pdf", "pdf"), "Gerando PDF...");
  assert.equal(getDownloadCtaCopy("docx", "docx"), "Gerando DOCX...");
});
