import type { Metadata } from "next";
import Link from "next/link";

import { getAbsoluteUrl, siteConfig } from "@/lib/site";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { AppHeader } from "@/components/app-header";

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

export default async function Home() {
  const user = await getCurrentAppUserFromCookies();

  return (
    <>
      <main className="flex h-screen overflow-hidden flex-col bg-[#FAFAFA] text-[#111111]">
        {user ? (
          <AppHeader userName={user.name} />
        ) : (
          <header className="flex shrink-0 items-center justify-between px-10 py-6">
            <span className="font-logo text-2xl tracking-tight">earlyCV</span>
            <Link
              href="/entrar?tab=entrar"
              style={{ color: "#666666" }}
              className="flex items-center gap-2 rounded-xl border border-[#DDDDDD] px-[18px] py-[6px] text-base font-medium transition-colors hover:border-[#BBBBBB] hover:text-[#111111]"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Entrar
            </Link>
          </header>
        )}

        <section className="flex flex-1 items-center justify-center px-10 md:px-40">
          <div className="-mt-6 flex w-full max-w-[848px] flex-col items-center gap-6">
            <div className="flex items-center gap-2 rounded-full border border-[#111111] bg-[#111111] px-4 py-1.5 text-sm font-medium text-white">
              <span className="text-lime-400">●</span>
              +3.500 CVs analisados
            </div>

            <h1 className="w-full text-center text-4xl font-medium leading-[1.05] tracking-tight text-[#111111] md:text-[56px]">
              Seu CV está sendo ignorado pelos recrutadores. A gente corrige
              isso.
            </h1>

            <p className="max-w-[720px] text-center text-lg leading-[1.35] text-[#666666] md:text-[22px]">
              Veja exatamente por que seu CV está sendo descartado e receba uma
              versão otimizada para a vaga.
            </p>

            <Link
              href="/adaptar"
              style={{ color: "#ffffff" }}
              className="mt-10 flex items-center gap-2 rounded-[14px] bg-[#111111] px-7 py-[18px] text-lg font-medium leading-none transition-colors hover:bg-[#222222]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M13 2L4.5 13.5H11L10 22L20.5 9.5H14L13 2Z" />
              </svg>
              Ver análise do meu CV grátis
            </Link>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-[18px] text-sm text-[#666666]">
              <span>
                <span className="mr-1.5 text-base text-lime-400">●</span>
                Passa nos filtros automáticos (ATS)
              </span>
              <span>
                <span className="mr-1.5 text-base text-lime-400">●</span>
                Adaptado para cada vaga específica
              </span>
              <span>
                <span className="mr-1.5 text-base text-lime-400">●</span>
                Resultado em menos de 30 segundos
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
