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
  assert.equal(
    urls.some((url) => url.endsWith("/curriculo-ats")),
    true,
  );
  assert.equal(
    urls.some((url) => url.endsWith("/adaptar-curriculo-para-vaga")),
    true,
  );
  assert.equal(
    urls.some((url) => url.endsWith("/curriculo-gupy")),
    true,
  );
  assert.equal(
    urls.some((url) => url.endsWith("/modelo-curriculo-ats")),
    true,
  );
  assert.equal(
    urls.some((url) => url.endsWith("/palavras-chave-curriculo")),
    true,
  );
});
