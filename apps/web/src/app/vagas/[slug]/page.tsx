import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, BrandMark, buttonVariants } from "@/components/ui";
import { getJobBySlug, jobs } from "@/lib/jobs";
import { getAbsoluteUrl } from "@/lib/site";

type JobPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  return jobs.map((job) => ({ slug: job.slug }));
}

export async function generateMetadata({
  params,
}: JobPageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = getJobBySlug(slug);

  if (!job) {
    return {
      title: "Vaga não encontrada",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = `${job.title} na ${job.company}`;
  const description = `${job.title} na ${job.company} em ${job.location}. ${job.summary} Veja requisitos, contexto, salário estimado e detalhes da candidatura.`;
  const url = getAbsoluteUrl(`/vagas/${job.slug}`);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    keywords: [job.title, job.company, job.location, ...job.keywords],
    openGraph: {
      type: "article",
      url,
      title,
      description,
    },
    twitter: {
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default async function JobPage({ params }: JobPageProps) {
  const { slug } = await params;
  const job = getJobBySlug(slug);

  if (!job) {
    notFound();
  }

  const jobJsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.datePosted,
    employmentType: job.employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressCountry: "BR",
        addressLocality: job.location,
      },
    },
    applicantLocationRequirements: {
      "@type": "Country",
      name: "Brasil",
    },
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "BRL",
      value: {
        "@type": "QuantitativeValue",
        unitText: "MONTH",
        value: job.salary,
      },
    },
    directApply: true,
    url: getAbsoluteUrl(`/vagas/${job.slug}`),
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-800">
      <script type="application/ld+json">{JSON.stringify(jobJsonLd)}</script>

      <div className="mx-auto w-full max-w-[1100px] px-6 py-8 md:px-10 md:py-10">
        <header className="mb-12 flex flex-col gap-6 border-b border-stone-200 pb-8 md:flex-row md:items-center md:justify-between">
          <Link className="flex items-center gap-2.5" href="/">
            <BrandMark className="size-7 rounded-[9px]" />
            <span className="font-logo text-2xl tracking-tight text-stone-800">
              earlyCV
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <Link className={buttonVariants({ variant: "outline" })} href="/">
              Voltar para home
            </Link>
            <Link className={buttonVariants()} href="/ui">
              Comecar agora
            </Link>
          </div>
        </header>

        <article className="space-y-10">
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="accent">{job.company}</Badge>
              <Badge variant="success">fit {job.fitScore}/100</Badge>
              <Badge variant="outline">{job.timeLabel}</Badge>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-stone-900 md:text-5xl">
                {job.title}
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-stone-600">
                {job.summary}
              </p>
            </div>

            <div className="grid gap-4 rounded-[20px] border border-stone-200 bg-white p-6 md:grid-cols-4">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
                  Localizacao
                </p>
                <p className="mt-2 text-sm font-medium text-stone-800">
                  {job.location}
                </p>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
                  Modelo
                </p>
                <p className="mt-2 text-sm font-medium text-stone-800">
                  {job.remoteType}
                </p>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
                  Tipo
                </p>
                <p className="mt-2 text-sm font-medium text-stone-800">
                  Tempo integral
                </p>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
                  Faixa salarial
                </p>
                <p className="mt-2 text-sm font-medium text-stone-800">
                  {job.salary}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6 rounded-[24px] border border-stone-200 bg-white p-8">
              <div className="space-y-3">
                <h2 className="text-2xl font-bold tracking-tight text-stone-900">
                  Descricao da vaga
                </h2>
                <p className="text-base leading-8 text-stone-600">
                  {job.description}
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight text-stone-900">
                  Palavras-chave que podem ranquear
                </h2>
                <ul className="grid gap-3 md:grid-cols-2">
                  {job.keywords.map((keyword) => (
                    <li
                      className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-700"
                      key={keyword}
                    >
                      {keyword}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <aside className="space-y-4 rounded-[24px] border border-stone-200 bg-white p-6 h-fit">
              <h2 className="text-xl font-bold tracking-tight text-stone-900">
                Proximo passo
              </h2>
              <p className="text-sm leading-7 text-stone-600">
                Use a EarlyCV para monitorar vagas semelhantes, avaliar
                aderencia e adaptar o curriculo para esta oportunidade.
              </p>
              <Link className={buttonVariants({ block: true })} href="/">
                Monitorar vagas parecidas
              </Link>
            </aside>
          </section>
        </article>
      </div>
    </main>
  );
}
