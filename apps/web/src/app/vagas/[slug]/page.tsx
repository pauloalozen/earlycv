import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, BrandMark, buttonVariants } from "@/components/ui";
import { getPublicJobBySlug } from "@/lib/public-jobs-api";
import { getAbsoluteUrl } from "@/lib/site";

type JobPageProps = {
  params: Promise<{ slug: string }>;
};

type JobSection = {
  bodyHtml: string;
  title: string;
};

function sanitizeJobHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function splitHtmlSections(descriptionHtml: string): JobSection[] {
  const safeHtml = sanitizeJobHtml(descriptionHtml ?? "");
  const sectionRegex = /<section>\s*<h2>(.*?)<\/h2>([\s\S]*?)<\/section>/gi;
  const sections: JobSection[] = [];

  let match = sectionRegex.exec(safeHtml);
  while (match) {
    const [, title, bodyHtml] = match;
    if (title?.trim() && bodyHtml?.trim()) {
      sections.push({
        title: title.trim(),
        bodyHtml: bodyHtml.trim(),
      });
    }
    match = sectionRegex.exec(safeHtml);
  }

  if (sections.length > 0) {
    return sections;
  }

  return [
    {
      title: "Descricao da vaga",
      bodyHtml: safeHtml,
    },
  ];
}

async function loadJob(slug: string) {
  try {
    return await getPublicJobBySlug(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = await loadJob(slug);

  if (!job) {
    return {
      title: "Vaga nao encontrada",
      robots: { index: false, follow: false },
    };
  }

  const title = `${job.title} na ${job.company}`;
  const description = `${job.title} na ${job.company} em ${job.location}. Veja detalhes da vaga e aplique no portal de origem.`;
  const url = getAbsoluteUrl(`/vagas/${job.slug}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title, description },
    twitter: { title, description },
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
  const job = await loadJob(slug);
  if (!job) notFound();
  const sections = splitHtmlSections(job.descriptionHtml);

  const jobJsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.publishedAtSource ?? job.firstSeenAt,
    employmentType: job.employmentType ?? undefined,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressCountry: job.country ?? "BR",
        addressLocality: job.location,
      },
    },
    applicantLocationRequirements: { "@type": "Country", name: "Brasil" },
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
            <span className="font-logo text-2xl tracking-tight text-stone-800">earlyCV</span>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <Link className={buttonVariants({ variant: "outline" })} href="/vagas">
              Voltar para vagas
            </Link>
            <Link className={buttonVariants()} href="/adaptar">
              Adaptar para esta vaga
            </Link>
          </div>
        </header>

        <article className="space-y-10">
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="accent">{job.company}</Badge>
              <Badge variant="outline">{job.workModel ?? "nao informado"}</Badge>
              <Badge variant="neutral">primeira captura {new Date(job.firstSeenAt).toLocaleDateString("pt-BR")}</Badge>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-stone-900 md:text-5xl">{job.title}</h1>
            </div>

            <div className="grid gap-4 rounded-[20px] border border-stone-200 bg-white p-6 md:grid-cols-4">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">Localizacao</p>
                <p className="mt-2 text-sm font-medium text-stone-800">{job.location}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">Modelo</p>
                <p className="mt-2 text-sm font-medium text-stone-800">{job.workModel ?? "nao informado"}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">Tipo</p>
                <p className="mt-2 text-sm font-medium text-stone-800">{job.employmentType ?? "nao informado"}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">Publicada em</p>
                <p className="mt-2 text-sm font-medium text-stone-800">
                  {job.publishedAtSource
                    ? new Date(job.publishedAtSource).toLocaleDateString("pt-BR")
                    : "nao informado"}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6 rounded-[24px] border border-stone-200 bg-white p-8">
              {sections.map((section) => (
                <div className="space-y-3" key={section.title}>
                  <h2 className="text-2xl font-bold tracking-tight text-stone-900">{section.title}</h2>
                  <div
                    className="prose prose-stone max-w-none text-base leading-8"
                    dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
                  />
                </div>
              ))}
            </div>

            <aside className="h-fit space-y-4 rounded-[24px] border border-stone-200 bg-white p-6">
              <h2 className="text-xl font-bold tracking-tight text-stone-900">Candidatura</h2>
              <p className="text-sm leading-7 text-stone-600">
                A candidatura acontece no portal da empresa. Abra a vaga original para aplicar.
              </p>
              <a
                className={buttonVariants({ block: true })}
                href={job.sourceJobUrl}
                rel="noreferrer"
                target="_blank"
              >
                Abrir vaga original
              </a>
            </aside>
          </section>
        </article>
      </div>
    </main>
  );
}
