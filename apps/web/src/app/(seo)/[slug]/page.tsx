import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqBlock } from "@/components/blog/faq-block";
import { PublicFooter } from "@/components/public-footer";
import { SeoAnalysisCta } from "@/components/seo-pages/seo-analysis-cta";
import { SeoBackToAreasFab } from "@/components/seo-pages/seo-back-to-areas-fab";
import { SeoHero } from "@/components/seo-pages/seo-hero";
import { SeoInternalLinks } from "@/components/seo-pages/seo-internal-links";
import { SeoKeywordAreaNav } from "@/components/seo-pages/seo-keyword-area-nav";
import { SeoKeywordHub } from "@/components/seo-pages/seo-keyword-hub";
import { SeoPageLayout } from "@/components/seo-pages/seo-page-layout";
import { SeoSection } from "@/components/seo-pages/seo-section";
import { SeoPageViewTracker } from "@/components/seo-pages/seo-view-trackers";
import {
  getPublishedSeoPages,
  getSeoPageBySlug,
  isSeoPageSlug,
} from "@/lib/seo-pages/pages";
import { getAbsoluteUrl } from "@/lib/site";

type SeoPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getPublishedSeoPages().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: SeoPageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!isSeoPageSlug(slug)) {
    return {
      robots: { follow: false, index: false },
      title: "Página não encontrada",
    };
  }

  const page = getSeoPageBySlug(slug);
  if (!page?.published) {
    return {
      robots: { follow: false, index: false },
      title: "Página não encontrada",
    };
  }

  const canonical = getAbsoluteUrl(page.path);
  return {
    alternates: { canonical },
    description: page.seo.description,
    openGraph: {
      description: page.seo.description,
      title: page.seo.title,
      type: "website",
      url: canonical,
    },
    robots: { follow: true, index: true },
    title: page.seo.title,
    twitter: {
      card: "summary_large_image",
      description: page.seo.description,
      title: page.seo.title,
    },
  };
}

export default async function SeoPage({ params }: SeoPageProps) {
  const { slug } = await params;
  const page = getSeoPageBySlug(slug);

  if (!page?.published) {
    notFound();
  }

  const canonical = getAbsoluteUrl(page.path);
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    dateModified: page.updatedAt,
    description: page.seo.description,
    name: page.seo.title,
    url: canonical,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        item: getAbsoluteUrl("/"),
        name: "Inicio",
        position: 1,
      },
      {
        "@type": "ListItem",
        item: canonical,
        name: page.hero.title,
        position: 2,
      },
    ],
  };

  const faqJsonLd = page.faq?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faq.map((entry) => ({
          "@type": "Question",
          acceptedAnswer: { "@type": "Answer", text: entry.answer },
          name: entry.question,
        })),
      }
    : null;

  return (
    <>
      <SeoPageLayout>
        <SeoPageViewTracker
          pageType={page.pageType}
          path={page.path}
          slug={page.slug}
        />
        <script type="application/ld+json">
          {JSON.stringify(webPageJsonLd)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbJsonLd)}
        </script>
        {faqJsonLd ? (
          <script type="application/ld+json">
            {JSON.stringify(faqJsonLd)}
          </script>
        ) : null}

        <SeoHero description={page.hero.description} title={page.hero.title} />
        <SeoAnalysisCta
          buttonLabel={page.cta.buttonLabel}
          description={page.cta.description}
          location="hero"
          pageType={page.pageType}
          path={page.path}
          slug={page.slug}
          target={page.cta.target}
          title={page.cta.title}
        />

        {page.alertMessage ? (
          <div
            style={{
              background: "rgba(245,197,24,0.06)",
              border: "1px solid rgba(245,197,24,0.2)",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13.5,
              color: "#5a4a10",
            }}
          >
            {page.alertMessage}
          </div>
        ) : null}

        {page.sections.map((section) => (
          <SeoSection key={section.heading} section={section} />
        ))}

        {page.pageType === "hub" && page.keywordGroups?.length ? (
          <>
            <div
              style={{
                paddingTop: 28,
                borderTop: "1px solid rgba(10,10,10,0.07)",
              }}
            >
              <h2
                style={{
                  fontSize: 21,
                  fontWeight: 500,
                  letterSpacing: -0.6,
                  margin: "0 0 8px",
                  color: "#0a0a0a",
                  fontFamily:
                    "var(--font-geist), -apple-system, system-ui, sans-serif",
                }}
              >
                Lista por área e cargo
              </h2>
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.75,
                  color: "#2a2a28",
                  margin: 0,
                  fontFamily:
                    "var(--font-geist), -apple-system, system-ui, sans-serif",
                }}
              >
                Este hub organiza termos por área e cargo. O foco é consulta
                rápida para montagem de currículo.
              </p>
            </div>
            <SeoKeywordAreaNav groups={page.keywordGroups} />
            <SeoKeywordHub groups={page.keywordGroups} />
            <SeoBackToAreasFab />
          </>
        ) : null}

        <SeoAnalysisCta
          buttonLabel={
            page.pageType === "hub"
              ? "Analisar meu currículo grátis"
              : page.cta.buttonLabel
          }
          description={
            page.pageType === "hub"
              ? "O EarlyCV compara seu currículo com a vaga e mostra lacunas, pontos fortes e termos relevantes para melhorar sua aderência."
              : page.cta.description
          }
          location="middle"
          pageType={page.pageType}
          path={page.path}
          slug={page.slug}
          target={page.cta.target}
          title={
            page.pageType === "hub"
              ? "Quer saber quais palavras da vaga faltam no seu currículo?"
              : page.cta.title
          }
        />

        <SeoInternalLinks links={page.relatedLinks} />

        {page.faq?.length ? <FaqBlock items={page.faq} /> : null}

        <SeoAnalysisCta
          buttonLabel={page.cta.buttonLabel}
          description={page.cta.description}
          location="bottom"
          pageType={page.pageType}
          path={page.path}
          slug={page.slug}
          target={page.cta.target}
          title={page.cta.title}
        />
      </SeoPageLayout>
      <PublicFooter />
    </>
  );
}
