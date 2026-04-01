import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";
import { jobs } from "@/lib/jobs";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";

const benefits = [
  {
    description: "Descubra vagas novas antes da maior parte dos candidatos.",
    title: "Velocidade real",
  },
  {
    description:
      "Veja rapidamente onde seu perfil encaixa melhor e onde vale insistir.",
    title: "Aderencia clara",
  },
  {
    description:
      "Adapte seu curriculo para cada vaga sem inventar experiencias.",
    title: "CV ajustado",
  },
];

const steps = [
  {
    description:
      "Suba seu CV e defina cargos, areas, localizacao e faixa salarial.",
    number: "01",
    title: "Envie seu curriculo",
  },
  {
    description:
      "A EarlyCV monitora vagas e calcula aderencia com base no seu historico.",
    number: "02",
    title: "Radar e score",
  },
  {
    description:
      "Receba sugestoes de ajustes no CV antes de seguir para a candidatura.",
    number: "03",
    title: "Candidate com mais forca",
  },
];

const features = [
  {
    description:
      "Detectamos oportunidades novas em portais de empresas antes do fluxo massivo de candidaturas.",
    meta: "captado primeiro",
    metaClassName: "text-orange-600",
    title: "Alerta antecipado",
  },
  {
    description:
      "Veja o potencial de aderencia e concentre tempo nas vagas com melhor combinacao.",
    meta: "fit 87/100",
    metaClassName: "text-teal-600",
    title: "Score de fit",
  },
  {
    description:
      "Ajustamos o resumo, destacamos competencias-chave e preservamos a verdade do seu historico.",
    meta: "sem inventar experiencia",
    metaClassName: "text-stone-500",
    title: "Adaptacao de curriculo",
  },
];

const pricing = [
  {
    description: "Radar basico e 3 adaptacoes por mes.",
    featured: false,
    title: "Free",
  },
  {
    description:
      "Mais velocidade, mais monitoramento e CV adaptado sem friccao.",
    featured: true,
    title: "Pro",
  },
  {
    description: "Alertas avancados, historico completo e mais personalizacao.",
    featured: false,
    title: "Premium",
  },
];

const faq = [
  {
    answer:
      "Nao. O sistema reorganiza e evidencia sua experiencia real para cada vaga.",
    question: "A EarlyCV inventa experiencias?",
  },
  {
    answer:
      "Tecnologia, dados, produto e digital, com foco em grandes empresas no Brasil.",
    question: "Quais areas a plataforma cobre?",
  },
];

export const metadata: Metadata = {
  title: "Encontre vagas antes da maioria",
  description:
    "Monitore vagas de tecnologia, produto e dados antes da maioria, descubra o score de aderencia e adapte seu curriculo para cada candidatura.",
  alternates: {
    canonical: getAbsoluteUrl("/"),
  },
  keywords: [
    ...siteConfig.keywords,
    "vaga de gerente de dados",
    "vaga de programador",
    "vaga de product analyst",
    "vagas antes do linkedin",
    "score de aderencia",
  ],
  openGraph: {
    url: getAbsoluteUrl("/"),
    title: "EarlyCV - Encontre vagas antes da maioria",
    description:
      "Radar de vagas, alertas antecipados, score de fit e adaptacao de curriculo para acelerar candidaturas.",
    images: [getAbsoluteUrl(siteConfig.ogImage)],
  },
  twitter: {
    title: "EarlyCV - Encontre vagas antes da maioria",
    description:
      "Radar de vagas, alertas antecipados, score de fit e adaptacao de curriculo para acelerar candidaturas.",
    images: [getAbsoluteUrl(siteConfig.ogImage)],
  },
};

const heroSignals = jobs.map((job) => ({
  company: job.company,
  slug: job.slug,
  time: job.timeLabel,
  title: job.title,
}));

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[32px] font-bold tracking-tight text-stone-800">
      {children}
    </h2>
  );
}

export default function Home() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: siteConfig.description,
    url: getAbsoluteUrl("/"),
    offers: pricing.map((plan) => ({
      "@type": "Offer",
      category: plan.title,
      description: plan.description,
      price: plan.title === "Free" ? "0" : plan.title === "Pro" ? "49" : "99",
      priceCurrency: "BRL",
    })),
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-800">
      <script type="application/ld+json">
        {JSON.stringify(softwareJsonLd)}
      </script>
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      <div className="mx-auto w-full max-w-[1440px]">
        <header className="fixed inset-x-0 top-0 z-50 border-b border-transparent bg-stone-50/92 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-12">
            <div className="flex items-center gap-2.5 self-start md:self-auto">
              <BrandMark className="size-7 rounded-[9px]" />
              <span className="text-2xl font-bold tracking-tight text-stone-800">
                EarlyCV
              </span>
            </div>

            <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-stone-500 md:gap-6">
              <a href="#como-funciona">Como funciona</a>
              <a href="#planos">Planos</a>
              <Link className={buttonVariants({ size: "sm" })} href="/ui">
                Comecar agora
              </Link>
            </nav>
          </div>
        </header>

        <section className="grid gap-12 px-6 pt-[156px] pb-[96px] md:px-12 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)] lg:items-start lg:gap-12">
          <div className="flex min-h-[333px] flex-col justify-between gap-8">
            <div className="space-y-5">
              <h1 className="max-w-[720px] text-5xl font-bold leading-[1.05] tracking-tight text-stone-800 lg:text-[56px]">
                Encontre vagas antes da maioria.
              </h1>
              <p className="max-w-[720px] text-lg leading-[1.4] text-stone-500">
                O radar da EarlyCV monitora portais de grandes empresas no
                Brasil, cruza seu perfil com as vagas e adapta seu curriculo
                para cada candidatura com mais velocidade e aderencia.
              </p>
            </div>

            <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center">
              <Link className={buttonVariants({ size: "lg" })} href="/ui">
                Comecar agora
              </Link>
              <p className="text-[13px] font-medium text-stone-500">
                Sem adivinhacao. Sem spam. So vagas relevantes primeiro.
              </p>
            </div>
          </div>

          <div className="rounded-[20px] bg-linear-to-br from-orange-600 to-amber-600 p-6 text-white shadow-[0_18px_60px_-30px_rgba(194,65,12,0.55)]">
            <div className="space-y-4">
              <p className="font-mono text-sm font-bold tracking-[0.01em]">
                Radar vivo de vagas antes do fluxo principal
              </p>
              <p className="text-base font-semibold text-white/80">
                Empresas grandes. Sinais frescos. Prioridade para quem chega
                antes.
              </p>
            </div>

            <div className="mt-4 rounded-2xl bg-white/10 p-3.5">
              <div className="space-y-2.5">
                {heroSignals.map((item) => (
                  <Link
                    className="flex items-center justify-between gap-4 rounded-xl bg-white/8 px-[14px] py-3 transition-colors hover:bg-white/14"
                    href={`/vagas/${item.slug}`}
                    key={item.slug}
                  >
                    <div className="space-y-1">
                      <p className="font-mono text-[10px] font-bold tracking-[0.01em] text-white/70">
                        {item.company}
                      </p>
                      <p className="text-[15px] font-bold">{item.title}</p>
                    </div>
                    <p className="shrink-0 font-mono text-[10px] font-bold tracking-[0.01em]">
                      {item.time}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="font-mono text-[10px] font-bold tracking-[0.01em] text-white/70">
                carrossel de oportunidades detectadas
              </p>
              <p className="font-mono text-xs font-bold">● ○ ○</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 px-6 py-8 md:px-12 lg:grid-cols-3">
          {benefits.map((item) => (
            <div
              className="flex min-h-36 flex-col gap-2.5 rounded-[20px] bg-[#F1F1F1] px-6 py-6"
              key={item.title}
            >
              <h3 className="text-lg font-bold tracking-tight text-stone-800">
                {item.title}
              </h3>
              <p className="max-w-sm text-[13px] leading-[1.4] text-stone-500">
                {item.description}
              </p>
            </div>
          ))}
        </section>

        <section className="space-y-8 px-6 py-20 md:px-12" id="como-funciona">
          <SectionTitle>Como funciona</SectionTitle>
          <div className="grid gap-5 lg:grid-cols-3">
            {steps.map((item) => (
              <div
                className="flex min-h-[188px] flex-col gap-3 rounded-[20px] bg-[#F1F1F1] px-6 py-6"
                key={item.number}
              >
                <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
                  {item.number}
                </p>
                <h3 className="text-xl font-bold tracking-tight text-stone-800">
                  {item.title}
                </h3>
                <p className="max-w-sm text-[13px] leading-[1.4] text-stone-500">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-8 px-6 py-8 md:px-12 md:py-10">
          <SectionTitle>O que torna a busca mais inteligente</SectionTitle>
          <div className="grid gap-5 lg:grid-cols-3">
            {features.map((item) => (
              <div
                className="flex min-h-[196px] flex-col gap-3.5 rounded-[20px] border border-stone-200 bg-white px-6 py-6"
                key={item.title}
              >
                <h3 className="text-xl font-bold tracking-tight text-stone-800">
                  {item.title}
                </h3>
                <p className="max-w-sm text-[13px] leading-[1.4] text-stone-500">
                  {item.description}
                </p>
                <p
                  className={cn(
                    "mt-auto font-mono text-[11px] font-bold uppercase tracking-[0.16em]",
                    item.metaClassName,
                  )}
                >
                  {item.meta}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-8 px-6 py-8 md:px-12 md:py-10">
          <SectionTitle>
            Vagas em destaque para indexacao e candidatura
          </SectionTitle>
          <div className="grid gap-5 lg:grid-cols-3">
            {jobs.map((job) => (
              <article
                className="flex min-h-[220px] flex-col gap-3 rounded-[20px] border border-stone-200 bg-white px-6 py-6"
                key={job.slug}
              >
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600">
                  {job.company}
                </p>
                <h3 className="text-xl font-bold tracking-tight text-stone-800">
                  <Link href={`/vagas/${job.slug}`}>{job.title}</Link>
                </h3>
                <p className="text-sm leading-6 text-stone-500">
                  {job.summary}
                </p>
                <p className="text-sm text-stone-500">
                  {job.location} - {job.remoteType}
                </p>
                <div className="mt-auto flex items-center justify-between gap-4">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-teal-600">
                    fit {job.fitScore}/100
                  </span>
                  <Link
                    className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                    href={`/vagas/${job.slug}`}
                  >
                    Ver vaga
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          className="relative left-1/2 right-1/2 mt-8 w-screen -translate-x-1/2 bg-[#F1F1F1]"
          id="planos"
        >
          <div className="mx-auto w-full max-w-[1440px] space-y-8 px-6 py-[88px] md:px-12">
            <SectionTitle>Planos para cada ritmo de candidatura</SectionTitle>
            <div className="grid gap-5 lg:grid-cols-3">
              {pricing.map((item) => (
                <div
                  className={cn(
                    "flex min-h-40 flex-col gap-2.5 rounded-[20px] px-6 py-6",
                    item.featured
                      ? "bg-orange-600 text-white"
                      : "bg-[#FAFAF9] text-stone-800",
                  )}
                  key={item.title}
                >
                  <h3 className="text-xl font-bold tracking-tight">
                    {item.title}
                  </h3>
                  <p
                    className={cn(
                      "max-w-sm text-[13px] leading-[1.4]",
                      item.featured ? "text-white/80" : "text-stone-500",
                    )}
                  >
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6 px-6 py-10 pb-24 md:px-12">
          <SectionTitle>FAQ</SectionTitle>
          <div className="space-y-4">
            {faq.map((item) => (
              <div
                className="space-y-2 rounded-2xl border border-stone-200 bg-white px-6 py-5"
                key={item.question}
              >
                <h3 className="text-base font-bold tracking-tight text-stone-800">
                  {item.question}
                </h3>
                <p className="text-[13px] leading-[1.4] text-stone-500">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
