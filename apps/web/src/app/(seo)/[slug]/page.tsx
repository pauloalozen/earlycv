import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqBlock } from "@/components/blog/faq-block";
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
      title: "Pagina nao encontrada",
    };
  }

  const page = getSeoPageBySlug(slug);
  if (!page?.published) {
    return {
      robots: { follow: false, index: false },
      title: "Pagina nao encontrada",
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
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
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
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {page.alertMessage}
        </section>
      ) : null}

      {page.sections.map((section) => (
        <SeoSection key={section.heading} section={section} />
      ))}

      {page.pageType === "hub" && page.keywordGroups?.length ? (
        <>
          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Lista por area e cargo
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Este hub utilitario organiza termos por area e cargo. Diferente do
              artigo do blog, aqui o foco e consulta rapida para montagem de
              curriculo.
            </p>
          </section>
          <SeoKeywordAreaNav groups={page.keywordGroups} />
          <SeoKeywordHub groups={page.keywordGroups} />
          <SeoBackToAreasFab />
        </>
      ) : null}

      <SeoAnalysisCta
        buttonLabel={
          page.pageType === "hub"
            ? "Analisar meu curriculo gratis"
            : page.cta.buttonLabel
        }
        description={
          page.pageType === "hub"
            ? "O EarlyCV compara seu curriculo com a vaga e mostra lacunas, pontos fortes e termos relevantes para melhorar sua aderencia."
            : page.cta.description
        }
        location="middle"
        pageType={page.pageType}
        path={page.path}
        slug={page.slug}
        target={page.cta.target}
        title={
          page.pageType === "hub"
            ? "Quer saber quais palavras da vaga faltam no seu curriculo?"
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
  );
}
