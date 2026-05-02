import type { BlogPost } from "@/lib/blog/types";
import { BlogCard } from "./blog-card";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function RelatedPosts({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section style={{ fontFamily: GEIST }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: -0.7,
          margin: "8px 0 16px",
          color: "#0a0a0a",
        }}
      >
        Leituras relacionadas
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
      >
        {posts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
