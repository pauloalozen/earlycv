import type { Metadata } from "next";
import Link from "next/link";

import { getAbsoluteUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Seu CV ajustado para cada vaga",
  description:
    "Descubra o que esta te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
  alternates: {
    canonical: getAbsoluteUrl("/"),
  },
  keywords: [
    ...siteConfig.keywords,
    "adaptar curriculo para vaga",
    "cv ajustado",
    "curriculo ats",
    "analise de curriculo",
  ],
  openGraph: {
    url: getAbsoluteUrl("/"),
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que esta te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
    images: [getAbsoluteUrl(siteConfig.ogImage)],
  },
  twitter: {
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que esta te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
    images: [getAbsoluteUrl(siteConfig.ogImage)],
  },
};

export default function Home() {
  return (
    <>
      <main className="flex h-screen overflow-hidden flex-col bg-[#FAFAFA] text-[#111111]">
        <header className="flex shrink-0 items-center justify-between px-10 py-6">
          <span className="font-logo text-2xl tracking-tight">earlyCV</span>
          <Link
            href="/adaptar"
            style={{ color: "#111111" }}
            className="rounded-xl border border-[#DDDDDD] bg-white px-[18px] py-[6px] text-base font-medium transition-colors hover:bg-stone-50"
          >
            Testar
          </Link>
        </header>

        <section className="flex flex-1 items-center justify-center px-10 md:px-40">
          <div className="-mt-6 flex w-full max-w-[848px] flex-col items-center gap-6">
            <h1 className="w-full text-center text-4xl font-medium leading-[1.05] tracking-tight text-[#111111] md:text-[56px]">
              Seu CV está te fazendo perder vagas. A gente corrige isso.
            </h1>

            <p className="max-w-[720px] text-center text-lg leading-[1.35] text-[#666666] md:text-[22px]">
              Descubra o que esta te eliminando nas vagas e receba um CV
              ajustado para aumentar suas chances de entrevista
            </p>

            <Link
              href="/adaptar"
              style={{ color: "#ffffff" }}
              className="mt-2 rounded-[14px] bg-[#111111] px-7 py-[18px] text-lg font-medium leading-none transition-colors hover:bg-[#222222]"
            >
              Testar gratis
            </Link>

            <div className="flex flex-wrap items-center justify-center gap-[18px] text-sm text-[#666666]">
              <span>
                <span className="mr-1.5 text-base text-lime-500">●</span>
                Compativel com ATS
              </span>
              <span>
                <span className="mr-1.5 text-base text-lime-500">●</span>
                Ajustado para cada vaga
              </span>
              <span>
                <span className="mr-1.5 text-base text-lime-500">●</span>Pronto
                em segundos
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
