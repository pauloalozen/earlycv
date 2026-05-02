import type { Metadata } from "next";

import { BlogAnalysisCta } from "@/components/blog/blog-analysis-cta";
import { BlogCard } from "@/components/blog/blog-card";
import { BlogIndexViewTracker } from "@/components/blog/blog-view-trackers";
import { PublicFooter } from "@/components/public-footer";
import {
  getAllPublishedBlogPosts,
  getFeaturedBlogPost,
} from "@/lib/blog/posts";
import { getAbsoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  alternates: {
    canonical: getAbsoluteUrl("/blog"),
  },
  description:
    "Guias praticos sobre curriculo, ATS e adaptacao para vagas no Brasil.",
  openGraph: {
    description:
      "Guias praticos sobre curriculo, ATS e adaptacao para vagas no Brasil.",
    title: "Blog EarlyCV",
    type: "website",
    url: getAbsoluteUrl("/blog"),
  },
  robots: { follow: true, index: true },
  title: "Blog EarlyCV",
  twitter: {
    card: "summary_large_image",
    description:
      "Guias praticos sobre curriculo, ATS e adaptacao para vagas no Brasil.",
    title: "Blog EarlyCV",
  },
};

export default function BlogIndexPage() {
  const posts = getAllPublishedBlogPosts();
  const featured = getFeaturedBlogPost();

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <BlogIndexViewTracker />
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-10 md:px-10">
        <header className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
            blog
          </p>
          <h1 className="text-4xl font-medium tracking-tight md:text-5xl">
            Conteudo pratico para melhorar suas candidaturas
          </h1>
          <p className="max-w-3xl text-base text-stone-600">
            Tutoriais diretos para adaptar curriculo com base real no seu
            historico.
          </p>
        </header>

        {featured ? (
          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              destaque
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {featured.title}
            </h2>
            <p className="mt-3 max-w-3xl text-stone-600">
              {featured.description}
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </section>

        <BlogAnalysisCta location="index" />
      </div>
      <PublicFooter />
    </main>
  );
}
