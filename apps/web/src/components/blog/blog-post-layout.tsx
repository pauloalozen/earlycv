import type { ReactNode } from "react";

import type { BlogPost } from "@/lib/blog/types";

import { BlogCategoryBadge } from "./blog-category-badge";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export function BlogPostLayout({
  children,
  post,
}: {
  children: ReactNode;
  post: BlogPost;
}) {
  return (
    <article style={{ fontFamily: GEIST }}>
      <header>
        <BlogCategoryBadge category={post.category} />
        <h1
          style={{
            fontSize: 42,
            fontWeight: 500,
            letterSpacing: -1.6,
            lineHeight: 1.05,
            margin: "16px 0 12px",
            color: "#0a0a0a",
          }}
        >
          {post.title}
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 24,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#8a8a85" }}>
            {post.publishedAt}
          </span>
          <span style={{ color: "#c0beb4", fontSize: 11 }}>·</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#8a8a85" }}>
            {post.readingTime}
          </span>
        </div>
        <p
          style={{
            fontSize: 17,
            color: "#45443e",
            lineHeight: 1.6,
            fontWeight: 400,
            margin: 0,
          }}
        >
          {post.description}
        </p>
      </header>
      {children}
    </article>
  );
}
