import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

import { markdownToHtml, splitMarkdownToLeadAndRest } from "./markdown";
import { parseBlogFrontmatter } from "./schema";
import type { BlogPost } from "./types";

const BLOG_CONTENT_DIR = path.join(process.cwd(), "src", "content", "blog");

function getMarkdownFiles() {
  if (!fs.existsSync(BLOG_CONTENT_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BLOG_CONTENT_DIR)
    .filter(
      (name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md",
    )
    .sort();
}

function buildPostFromFile(fileName: string): BlogPost {
  const fullPath = path.join(BLOG_CONTENT_DIR, fileName);
  const source = fs.readFileSync(fullPath, "utf8");
  const parsed = matter(source);
  const frontmatter = parseBlogFrontmatter(
    parsed.data as Record<string, unknown>,
  );

  return {
    ...frontmatter,
    body: parsed.content.trim(),
    excerpt: frontmatter.description,
    sourcePath: fullPath,
  };
}

function getAllBlogPostsRaw() {
  return getMarkdownFiles().map(buildPostFromFile);
}

export function getAllPublishedBlogPosts() {
  return getAllBlogPostsRaw()
    .filter((post) => post.status === "published")
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
}

export function getBlogPostBySlug(slug: string) {
  return getAllPublishedBlogPosts().find((post) => post.slug === slug) ?? null;
}

export function getFeaturedBlogPost() {
  return getAllPublishedBlogPosts().find((post) => post.featured) ?? null;
}

export function getBlogPostCategories(posts: BlogPost[]) {
  const categories = new Set<string>();

  for (const post of posts) {
    const normalized = post.category.trim();
    if (!normalized) {
      continue;
    }
    categories.add(normalized);
  }

  return [...categories];
}

export function getRelatedBlogPosts(slug: string, limit = 3) {
  const current = getBlogPostBySlug(slug);
  if (!current) {
    return [];
  }

  return getAllPublishedBlogPosts()
    .filter((post) => post.slug !== slug)
    .map((post) => {
      const sharedTags = post.tags.filter((tag) =>
        current.tags.includes(tag),
      ).length;
      const sameCategory = post.category === current.category ? 1 : 0;
      return { post, score: sharedTags * 2 + sameCategory };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.post);
}

export async function getBlogPostHtmlBySlug(slug: string) {
  const post = getBlogPostBySlug(slug);
  if (!post) {
    return null;
  }

  const { leadHtml, restHtml } = await splitMarkdownToLeadAndRest(post.body);

  return {
    html: await markdownToHtml(post.body),
    leadHtml,
    post,
    restHtml,
  };
}

export function getPublishedBlogSlugs() {
  return getAllPublishedBlogPosts().map((post) => post.slug);
}

export function getBlogSitemapEntries() {
  return getAllPublishedBlogPosts().map((post) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(post.updatedAt || post.publishedAt),
    priority: 0.65,
    slug: post.slug,
  }));
}
