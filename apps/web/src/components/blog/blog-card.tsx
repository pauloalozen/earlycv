import Link from "next/link";

import type { BlogPost } from "@/lib/blog/types";

import { BlogCategoryBadge } from "./blog-category-badge";

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <BlogCategoryBadge category={post.category} />
        <span className="text-xs text-stone-500">{post.readingTime}</span>
      </div>
      <h3 className="text-xl font-semibold tracking-tight text-stone-900">
        <Link className="hover:underline" href={`/blog/${post.slug}`}>
          {post.title}
        </Link>
      </h3>
      {post.mainTag ? (
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          {post.mainTag}
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-7 text-stone-600">
        {post.description}
      </p>
      <p className="mt-2 text-xs text-stone-500">
        <Link className="hover:underline" href={`/blog/${post.slug}`}>
          {`/blog/${post.slug}`}
        </Link>
      </p>
      <p className="mt-4 text-xs text-stone-500">{post.publishedAt}</p>
    </article>
  );
}
