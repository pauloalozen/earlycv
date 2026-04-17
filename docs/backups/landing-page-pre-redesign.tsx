import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { FlipWord } from "@/components/flip-word";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Seu CV ajustado para cada vaga",
  description:
    "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
  alternates: {
    canonical: getAbsoluteUrl("/"),
  },
  keywords: [
    ...siteConfig.keywords,
    "adaptar curriculo para vaga",
    "cv ajustado",
    "curriculo ats",
    "análise de currículo",
  ],
  openGraph: {
    url: getAbsoluteUrl("/"),
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
    images: [getAbsoluteUrl(siteConfig.ogImage)],
  },
  twitter: {
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
    images: [getAbsoluteUrl(siteConfig.ogImage)],
  },
};

export default async function Home() {
  const user = await getCurrentAppUserFromCookies();

  return (
    <main className="flex h-screen overflow-hidden flex-col bg-[#FAFAFA] text-[#111111]">
      {user ? (
        <AppHeader userName={user.name} backgroundColor="#FAFAFA" />
      ) : (
        <header className="flex shrink-0 items-center justify-between px-10 py-6">
          <span className="font-logo text-2xl tracking-tight">earlyCV</span>
          <Link
            href="/entrar?tab=entrar"
            style={{ color: "#666666" }}
            className="flex items-center gap-2 rounded-xl border border-[#DDDDDD] px-[18px] py-[6px] text-base font-medium transition-colors hover:border-[#BBBBBB] hover:text-[#111111]"
          >
            <svg
              aria-hidden="true"
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
            Baseado na vaga que você quer.
          </div>

          <h1 className="w-full text-center text-4xl font-medium leading-[1.05] tracking-tight text-[#111111] md:text-[56px]">
            Um CV <FlipWord word="ajustado" /> para cada vaga. <br></br>
            Automático.
          </h1>

          <p className="max-w-[720px] text-center text-lg leading-[1.35] text-[#666666] md:text-[22px]">
            Seu CV não passa porque não está alinhado com a vaga. A gente ajusta
            isso pra você.
          </p>

          <Link
            href="/adaptar"
            style={{ color: "#ffffff" }}
            className="mt-4 flex items-center gap-2 rounded-[14px] bg-[#111111] px-7 py-[18px] text-lg font-medium leading-none transition-colors hover:bg-[#222222]"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M13 2L4.5 13.5H11L10 22L20.5 9.5H14L13 2Z" />
            </svg>
            Adaptar meu CV para uma vaga
          </Link>

          <p className="flex flex-wrap items-center justify-center gap-2 text-center text-sm font-medium text-[#666666]">
            <span>Cole a vaga</span>
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
            <span>Envie seu CV</span>
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
            <span>Veja o que ajustar</span>
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-[18px] text-sm text-[#666666]">
            <span className="inline-flex items-center">
              <span className="mr-1.5 text-sm leading-none text-lime-400">
                ●
              </span>
              Ajustado para cada vaga específica
            </span>
            <span className="inline-flex items-center">
              <span className="mr-1.5 text-sm leading-none text-lime-400">
                ●
              </span>
              Análise grátis. Sem cartão.
            </span>
            <span className="inline-flex items-center">
              <span className="mr-1.5 text-sm leading-none text-lime-400">
                ●
              </span>
              Resultado em segundos
            </span>
          </div>
        </div>
      </section>

      <footer className="shrink-0 px-6 pb-5">
        <div className="mx-auto flex w-full max-w-[848px] items-center justify-center gap-4 text-sm text-[#A8A29E]">
          <Link href="/termos-de-uso" className="hover:text-[#78716C]">
            Termos de uso
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/privacidade" className="hover:text-[#78716C]">
            Privacidade
          </Link>
        </div>
      </footer>
    </main>
  );
}
