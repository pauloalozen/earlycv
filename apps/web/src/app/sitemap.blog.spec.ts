import assert from "node:assert/strict";
import { test } from "node:test";

import sitemap from "./sitemap";

test("sitemap includes /blog and published blog posts", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);
  const byPath = new Map(
    entries.map((entry) => [new URL(entry.url).pathname, entry]),
  );

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

  assert.equal(byPath.get("/adaptar")?.priority, 0.8);
  assert.equal(byPath.get("/adaptar")?.changeFrequency, "weekly");
  assert.equal(byPath.get("/adaptar-curriculo-para-vaga")?.priority, 0.85);
  assert.equal(byPath.get("/curriculo-ats")?.priority, 0.8);
  assert.equal(byPath.get("/palavras-chave-curriculo")?.priority, 0.8);
  assert.equal(byPath.get("/curriculo-gupy")?.priority, 0.75);
  assert.equal(byPath.get("/modelo-curriculo-ats")?.priority, 0.75);

  assert.equal(byPath.get("/privacidade")?.priority, 0.2);
  assert.equal(byPath.get("/privacidade")?.changeFrequency, "yearly");
  assert.equal(byPath.get("/termos-de-uso")?.priority, 0.2);
  assert.equal(byPath.get("/termos-de-uso")?.changeFrequency, "yearly");

  assert.equal(
    urls.some((url) => new URL(url).pathname.startsWith("/vagas/")),
    false,
  );
});
