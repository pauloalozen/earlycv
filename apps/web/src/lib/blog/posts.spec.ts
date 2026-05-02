import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAllPublishedBlogPosts,
  getBlogPostBySlug,
  getFeaturedBlogPost,
  getPublishedBlogSlugs,
} from "./posts";
import { parseBlogFrontmatter } from "./schema";

test("blog loader lists only published posts ordered by publishedAt desc", () => {
  const posts = getAllPublishedBlogPosts();
  assert.ok(posts.length >= 3);
  assert.equal(
    posts.every((post) => post.status === "published"),
    true,
  );
  assert.equal(
    posts.map((post) => post.slug).includes("rascunho-blog-exemplo"),
    false,
  );

  const publishedAt = posts.map((post) => new Date(post.publishedAt).getTime());
  assert.deepEqual(
    publishedAt,
    [...publishedAt].sort((a, b) => b - a),
  );
});

test("blog loader includes seeded slugs and excludes draft from static params", () => {
  const slugs = getPublishedBlogSlugs();
  assert.equal(slugs.includes("como-adaptar-curriculo-para-vaga"), true);
  assert.equal(slugs.includes("curriculo-ats"), true);
  assert.equal(slugs.includes("palavras-chave-curriculo"), true);
  assert.equal(slugs.includes("rascunho-blog-exemplo"), false);
});

test("blog loader resolves by slug and returns null for unknown slug", () => {
  assert.equal(
    getBlogPostBySlug("como-adaptar-curriculo-para-vaga")?.slug,
    "como-adaptar-curriculo-para-vaga",
  );
  assert.equal(getBlogPostBySlug("slug-inexistente"), null);
});

test("blog loader returns a featured post", () => {
  const featured = getFeaturedBlogPost();
  assert.ok(featured);
  assert.equal(featured.featured, true);
});

test("blog frontmatter parser validates required fields", () => {
  assert.throws(
    () => parseBlogFrontmatter({ title: "Only title" }),
    /missing required field/i,
  );
});
