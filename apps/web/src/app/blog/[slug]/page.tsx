import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogAnalysisCta } from "@/components/blog/blog-analysis-cta";
import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { BlogPostViewTracker } from "@/components/blog/blog-view-trackers";
import { FaqBlock } from "@/components/blog/faq-block";
import { RelatedPosts } from "@/components/blog/related-posts";
import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
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

const GRAIN = `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

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
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        color: "#0a0a0a",
        position: "relative",
      }}
    >
      {/* Grain */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.5,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: GRAIN,
        }}
      />

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

      <PublicNavBar />

      <div
        style={{
          maxWidth: 660,
          margin: "0 auto",
          padding: "56px 40px 0",
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <BlogPostLayout post={post}>
          <div
            className="prose prose-stone max-w-none prose-a:text-stone-900 prose-a:underline"
            style={{ marginTop: 32 }}
          >
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

        <div data-testid="blog-post-related" style={{ marginTop: 32 }}>
          <RelatedPosts posts={related} />
        </div>
        <BlogAnalysisCta location="bottom" slug={post.slug} />
        {post.faq ? (
          <div data-testid="blog-post-faq">
            <FaqBlock items={post.faq} />
          </div>
        ) : null}
      </div>
      <PublicFooter />
    </main>
  );
}
