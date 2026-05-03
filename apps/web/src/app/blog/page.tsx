import type { Metadata } from "next";
import Link from "next/link";

import { BlogAnalysisCta } from "@/components/blog/blog-analysis-cta";
import { BlogCard } from "@/components/blog/blog-card";
import { BlogIndexViewTracker } from "@/components/blog/blog-view-trackers";
import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
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
    "Guias práticos sobre currículo, ATS e adaptação para vagas no Brasil.",
  openGraph: {
    description:
      "Guias práticos sobre currículo, ATS e adaptação para vagas no Brasil.",
    title: "Blog EarlyCV",
    type: "website",
    url: getAbsoluteUrl("/blog"),
  },
  robots: { follow: true, index: true },
  title: "Blog EarlyCV",
  twitter: {
    card: "summary_large_image",
    description:
      "Guias práticos sobre currículo, ATS e adaptação para vagas no Brasil.",
    title: "Blog EarlyCV",
  },
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const GRAIN = `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

export default function BlogIndexPage() {
  const posts = getAllPublishedBlogPosts();
  const featured = getFeaturedBlogPost();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        fontFamily: GEIST,
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

      <BlogIndexViewTracker />
      <PublicNavBar />

      <div
        style={{
          maxWidth: 860,
          margin: "0 auto",
          padding: "56px clamp(16px, 4vw, 40px) 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <header style={{ marginBottom: 40 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1.2,
              color: "#8a8a85",
              fontWeight: 500,
              marginBottom: 16,
            }}
          >
            BLOG
          </div>
          <h1
            style={{
              fontSize: "clamp(2rem, 7vw, 3.25rem)",
              fontWeight: 500,
              letterSpacing: -2,
              lineHeight: 1.04,
              margin: "0 0 14px",
            }}
          >
            Conteúdo prático para melhorar
            <br />
            suas candidaturas.
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "#45443e",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            Tutoriais diretos para adaptar currículo com base real no seu
            histórico.
          </p>
        </header>

        {/* Featured */}
        {featured ? (
          <Link
            href={`/blog/${featured.slug}`}
            style={{
              display: "block",
              textDecoration: "none",
              color: "inherit",
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 14,
              padding: "clamp(20px, 4vw, 28px) clamp(16px, 4vw, 32px)",
              marginBottom: 24,
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.2,
                color: "#8a8a85",
                fontWeight: 500,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  boxShadow: "0 0 5px #c6ff3a",
                  display: "inline-block",
                }}
              />
              DESTAQUE
            </div>
            <h2
              style={{
                fontSize: "clamp(1.35rem, 4.8vw, 1.75rem)",
                fontWeight: 500,
                letterSpacing: -1,
                lineHeight: 1.2,
                margin: "0 0 10px",
              }}
            >
              {featured.title}
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "#45443e",
                lineHeight: 1.6,
                margin: "0 0 18px",
              }}
            >
              {featured.description}
            </p>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#a0a098",
                  letterSpacing: 0.2,
                  overflowWrap: "anywhere",
                }}
              >
                {`/blog/${featured.slug}`}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#a0a098",
                  letterSpacing: 0.2,
                }}
              >
                {featured.publishedAt}
              </span>
            </div>
          </Link>
        ) : null}

        {/* Posts grid */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
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
