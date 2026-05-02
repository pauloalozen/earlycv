import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogAnalysisCta } from "@/components/blog/blog-analysis-cta";
import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { BlogPostViewTracker } from "@/components/blog/blog-view-trackers";
import { FaqBlock } from "@/components/blog/faq-block";
import { RelatedPosts } from "@/components/blog/related-posts";
import {
  getBlogPostBySlug,
  getBlogPostHtmlBySlug,
  getPublishedBlogSlugs,
  getRelatedBlogPosts,
} from "@/lib/blog/posts";
import { getAbsoluteUrl } from "@/lib/site";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getPublishedBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return {
      robots: { follow: false, index: false },
      title: "Artigo nao encontrado",
    };
  }

  const canonical = getAbsoluteUrl(`/blog/${post.slug}`);
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.description;

  return {
    alternates: { canonical },
    description,
    openGraph: {
      authors: ["EarlyCV"],
      description,
      modifiedTime: post.updatedAt,
      publishedTime: post.publishedAt,
      title,
      type: "article",
      url: canonical,
    },
    robots: { follow: true, index: true },
    title,
    twitter: { card: "summary_large_image", description, title },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const payload = await getBlogPostHtmlBySlug(slug);

  if (!payload) {
    notFound();
  }

  const { html, leadHtml, post, restHtml } = payload;
  const related = getRelatedBlogPosts(post.slug, 3);
  const canonical = getAbsoluteUrl(`/blog/${post.slug}`);
  const coverImageUrl = post.coverImage
    ? post.coverImage.startsWith("http")
      ? post.coverImage
      : getAbsoluteUrl(post.coverImage)
    : null;

  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    author: { "@type": "Organization", name: "EarlyCV" },
    dateModified: post.updatedAt,
    datePublished: post.publishedAt,
    description: post.description,
    headline: post.title,
    ...(coverImageUrl ? { image: [coverImageUrl] } : {}),
    mainEntityOfPage: canonical,
    publisher: { "@type": "Organization", name: "EarlyCV" },
  };

  const faqJsonLd = post.faq?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq.map((entry) => ({
          "@type": "Question",
          acceptedAnswer: { "@type": "Answer", text: entry.answer },
          name: entry.question,
        })),
      }
    : null;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <BlogPostViewTracker
        category={post.category}
        slug={post.slug}
        tags={post.tags}
        title={post.title}
      />
      <script type="application/ld+json">
        {JSON.stringify(blogPostingJsonLd)}
      </script>
      {faqJsonLd ? (
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      ) : null}

      <div className="mx-auto max-w-4xl space-y-8 px-6 py-10 md:px-10">
        <BlogPostLayout post={post}>
          <div className="prose prose-stone max-w-none prose-a:text-stone-900 prose-a:underline">
            {leadHtml ? (
              <div
                data-testid="blog-post-lead"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: content comes from local reviewed markdown files
                dangerouslySetInnerHTML={{ __html: leadHtml }}
              />
            ) : null}
          </div>
          <div data-testid="blog-post-top-cta">
            <BlogAnalysisCta location="middle" slug={post.slug} />
          </div>
          <div
            className="prose prose-stone max-w-none prose-a:text-stone-900 prose-a:underline"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: content comes from local reviewed markdown files
            dangerouslySetInnerHTML={{ __html: leadHtml ? restHtml : html }}
          />
        </BlogPostLayout>

        <div data-testid="blog-post-related">
          <RelatedPosts posts={related} />
        </div>
        <BlogAnalysisCta location="bottom" slug={post.slug} />
        {post.faq ? (
          <div data-testid="blog-post-faq">
            <FaqBlock items={post.faq} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
