import type { Metadata } from "next";
import Link from "next/link";

import { Badge, BrandMark, buttonVariants, Card, Input } from "@/components/ui";
import { filterPublicJobs, listPublicJobs } from "@/lib/public-jobs-api";
import { getAbsoluteUrl } from "@/lib/site";

type JobsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export const metadata: Metadata = {
  title: "Vagas",
  description:
    "Busque vagas ativas monitoradas pela EarlyCV com foco em tecnologia, dados, produto e funcoes digitais.",
  alternates: {
    canonical: getAbsoluteUrl("/vagas"),
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Vagas | EarlyCV",
    description:
      "Busque vagas ativas monitoradas pela EarlyCV com foco em tecnologia, dados, produto e funcoes digitais.",
    url: getAbsoluteUrl("/vagas"),
    type: "website",
  },
  twitter: {
    title: "Vagas | EarlyCV",
    description:
      "Busque vagas ativas monitoradas pela EarlyCV com foco em tecnologia, dados, produto e funcoes digitais.",
  },
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const { q } = await searchParams;
  const jobs = filterPublicJobs(await listPublicJobs(), q);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto w-full max-w-[1100px] px-6 py-8 md:px-10 md:py-10">
        <header className="mb-8 flex flex-col gap-6 border-b border-stone-200 pb-8 md:flex-row md:items-center md:justify-between">
          <Link className="flex items-center gap-2.5" href="/">
            <BrandMark className="size-7 rounded-[9px]" />
            <span className="font-logo text-2xl tracking-tight text-stone-800">earlyCV</span>
          </Link>

          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants({ variant: "outline" })} href="/">
              Home
            </Link>
            <Link className={buttonVariants()} href="/adaptar">
              Adaptar curriculo
            </Link>
          </div>
        </header>

        <section className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Buscar vagas</h1>
          <form className="flex gap-3" method="GET">
            <Input name="q" defaultValue={q} placeholder="Cargo, empresa, local ou palavra-chave" />
            <button className={buttonVariants({ variant: "outline" })} type="submit">
              Buscar
            </button>
          </form>
        </section>

        <section className="mt-8 grid gap-4">
          {jobs.map((job) => (
            <Card key={job.id} className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{job.company}</Badge>
                <Badge variant="neutral">{job.workModel ?? "nao informado"}</Badge>
              </div>
              <div className="space-y-2">
                <Link href={`/vagas/${job.slug}`} className="text-xl font-bold tracking-tight hover:underline">
                  {job.title}
                </Link>
                <p className="text-sm text-stone-600">{job.location}</p>
              </div>
              <p className="line-clamp-3 text-sm leading-7 text-stone-700">{job.description}</p>
            </Card>
          ))}
          {jobs.length === 0 ? (
            <Card>
              <p className="text-sm text-stone-600">Nenhuma vaga encontrada para o termo informado.</p>
            </Card>
          ) : null}
        </section>
      </div>
    </main>
  );
}
