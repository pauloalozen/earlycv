import Link from "next/link";

import type { BlogPost } from "@/lib/blog/types";

import { BlogCategoryBadge } from "./blog-category-badge";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "18px 20px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        fontFamily: GEIST,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <BlogCategoryBadge category={post.category} />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: "#8a8a85",
          }}
        >
          {post.readingTime}
        </span>
      </div>
      <h3
        style={{
          fontSize: 15.5,
          fontWeight: 500,
          letterSpacing: -0.3,
          lineHeight: 1.3,
          margin: "0 0 6px",
          color: "#0a0a0a",
        }}
      >
        {post.title}
      </h3>
      {post.mainTag ? (
        <p
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 0.8,
            color: "#8a8a85",
            margin: "0 0 8px",
          }}
        >
          {post.mainTag}
        </p>
      ) : null}
      <p
        style={{
          fontSize: 13,
          color: "#5a5a55",
          lineHeight: 1.55,
          flex: 1,
          margin: "0 0 16px",
        }}
      >
        {post.description}
      </p>
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <p
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: "#a0a098",
            letterSpacing: 0.2,
            margin: 0,
          }}
        >
          {`/blog/${post.slug}`}
        </p>
        <p
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: "#a0a098",
            letterSpacing: 0.2,
            margin: 0,
          }}
        >
          {post.publishedAt}
        </p>
      </div>
    </Link>
  );
}
