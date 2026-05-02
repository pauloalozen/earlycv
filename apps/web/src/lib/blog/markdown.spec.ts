import assert from "node:assert/strict";
import { test } from "node:test";

import { markdownToHtml } from "./markdown";

test("markdownToHtml renders semantic html for blog content", async () => {
  const html = await markdownToHtml(
    `## Titulo\n\nParagrafo\n\n- item 1\n- item 2\n\n[Link interno](/blog/curriculo-ats)\n\n> Citacao`,
  );

  assert.match(html, /<h2>Titulo<\/h2>/);
  assert.match(html, /<p>Paragrafo<\/p>/);
  assert.match(html, /<ul>\s*<li>item 1<\/li>\s*<li>item 2<\/li>\s*<\/ul>/);
  assert.match(html, /<a href="\/blog\/curriculo-ats">Link interno<\/a>/);
  assert.match(html, /<blockquote>\s*<p>Citacao<\/p>\s*<\/blockquote>/);
});
