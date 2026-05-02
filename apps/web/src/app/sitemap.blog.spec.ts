import assert from "node:assert/strict";
import { test } from "node:test";

import sitemap from "./sitemap";

test("sitemap includes /blog and published blog posts", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  assert.equal(
    urls.some((url) => url.endsWith("/blog")),
    true,
  );
  assert.equal(
    urls.some((url) => url.endsWith("/blog/como-adaptar-curriculo-para-vaga")),
    true,
  );
  assert.equal(
    urls.some((url) => url.endsWith("/blog/rascunho-blog-exemplo")),
    false,
  );
});
