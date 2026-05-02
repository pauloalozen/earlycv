import type { BlogPost } from "@/lib/blog/types";
import { BlogCard } from "./blog-card";

export function RelatedPosts({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
        Leituras relacionadas
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {posts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
