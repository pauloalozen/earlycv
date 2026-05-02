import type { ReactNode } from "react";

import type { BlogPost } from "@/lib/blog/types";
import { BlogCategoryBadge } from "./blog-category-badge";

export function BlogPostLayout({
  children,
  post,
}: {
  children: ReactNode;
  post: BlogPost;
}) {
  return (
    <article className="space-y-6">
      <header className="space-y-4 border-b border-stone-200 pb-6">
        <BlogCategoryBadge category={post.category} />
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
          {post.title}
        </h1>
        <p className="text-lg leading-8 text-stone-600">{post.description}</p>
        <div className="flex gap-4 text-sm text-stone-500">
          <span>{post.publishedAt}</span>
          <span>{post.readingTime}</span>
        </div>
      </header>
      {children}
    </article>
  );
}
