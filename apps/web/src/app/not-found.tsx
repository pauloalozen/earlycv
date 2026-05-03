import type { Metadata } from "next";
import Link from "next/link";

import { NotFoundCounter } from "./not-found-counter";

export const metadata: Metadata = {
  title: "404",
  description: "Página não encontrada.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

function LogoMark() {
  return (
    <svg
      aria-hidden
      className="shrink-0"
      width="20"
      height="16"
      viewBox="0 0 40 32"
      fill="none"
    >
      <title>earlyCV</title>
      <rect
        x="0"
        y="0"
        width="13"
        height="4"
        rx="1.5"
        fill="rgba(10,10,10,0.45)"
      />
      <rect
        x="17"
        y="0"
        width="10"
        height="4"
        rx="1.5"
        fill="rgba(10,10,10,0.45)"
      />
      <rect x="31" y="0" width="9" height="4" rx="1.5" fill="#c6ff3a" />
      <rect x="0" y="14" width="15" height="4" rx="1.5" fill="#c6ff3a" />
      <rect
        x="19"
        y="14"
        width="21"
        height="4"
        rx="1.5"
        fill="rgba(10,10,10,0.45)"
      />
      <rect
        x="0"
        y="28"
        width="8"
        height="4"
        rx="1.5"
        fill="rgba(10,10,10,0.45)"
      />
      <rect x="12" y="28" width="15" height="4" rx="1.5" fill="#c6ff3a" />
      <rect
        x="31"
        y="28"
        width="9"
        height="4"
        rx="1.5"
        fill="rgba(10,10,10,0.18)"
      />
    </svg>
  );
}

export default function NotFound() {
  return (
    <div
      className="relative min-h-[100svh] overflow-hidden bg-[#ecebe5] text-[#0a0a0a]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        fontFamily: "var(--font-geist), -apple-system, system-ui, sans-serif",
      }}
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-50 mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <header className="fixed inset-x-0 top-0 z-10 bg-[#f3f2edf2] px-4 py-[18px] backdrop-blur-[12px] md:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link className="flex items-center gap-2.5 no-underline" href="/">
            <LogoMark />
            <div className="flex items-baseline">
              <span className="text-[17px] font-light leading-none tracking-[-0.5px]">
                early
              </span>
              <span className="text-[17px] font-bold leading-none tracking-[-0.5px]">
                CV
              </span>
            </div>
            <span className="ml-0.5 rounded-[3px] border border-[#d8d6ce] px-[5px] py-px font-mono text-[10px] font-medium text-[#8a8a85]">
              v1.2
            </span>
          </Link>

          <Link
            className="inline-block rounded-lg bg-[#0a0a0a] px-3.5 py-[9px] text-[12.5px] font-medium !text-white shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.08)]"
            href="/adaptar"
          >
            Adaptar meu CV →
          </Link>
        </div>
      </header>

      <main className="relative z-[1] flex min-h-[100svh] items-center justify-center px-4 pt-28 pb-8 md:min-h-full md:px-10 md:pt-22 md:pb-18">
        <div className="flex w-full max-w-[560px] flex-col items-center text-center">
          <div className="mb-6 w-full max-w-[360px] overflow-hidden rounded-2xl border border-[#0a0a0a14] bg-[#fafaf6] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_50px_-16px_rgba(10,10,10,0.16)]">
            <div className="relative flex items-center gap-[7px] border-b border-[#0a0a0a0f] bg-[#f0efe9] px-3.5 py-[11px]">
              <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
              <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
              <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
              <span className="pointer-events-none absolute inset-x-0 text-center font-mono text-[11px] font-medium text-[#7a7a74]">
                cv-analysis.earlyCV
              </span>
            </div>

            <div className="px-6 pt-[22px] pb-6">
              <div className="mb-3.5 inline-flex items-center gap-[7px] font-mono text-[10px] font-medium tracking-[1px] text-[#8a8a85]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f5c518]" />
                DIAGNÓSTICO · PÁGINA
              </div>

              <NotFoundCounter />

              <div className="mb-4 flex flex-col gap-[8px]">
                <span className="h-1 w-[78%] rounded bg-[#0a0a0a73]" />
                <span className="h-1 w-[52%] rounded bg-[#c6ff3a]" />
                <span className="h-1 w-[88%] rounded bg-[#0a0a0a73]" />
                <span className="h-1 w-[40%] rounded bg-[#c6ff3a]" />
                <span className="h-1 w-[65%] rounded bg-[#0a0a0a73]" />
                <span className="h-1 w-[30%] rounded bg-[#0a0a0a24]" />
              </div>
            </div>
          </div>

          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0a0a0a0f] bg-[#0a0a0a0a] px-2.5 py-1.5 font-mono text-[10.5px] font-medium tracking-[1.2px] text-[#555]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c6ff3a] shadow-[0_0_6px_#c6ff3a]" />
            ERRO · PÁGINA NÃO ENCONTRADA
          </div>

          <h1 className="mt-6 mb-4 text-[38px] leading-[1.04] font-medium tracking-[-1.8px] md:text-[46px]">
            Esta página
            <br />
            não{" "}
            <em
              style={{
                fontFamily: "var(--font-instrument-serif), serif",
                fontStyle: "italic",
                fontWeight: 400,
                letterSpacing: -1,
              }}
            >
              existe.
            </em>
          </h1>

          <p className="mb-7 max-w-[420px] text-base leading-[1.45] text-[#45443e]">
            O endereço que você acessou não foi encontrado. Pode ter sido
            removido, renomeado ou nunca ter existido.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 border-t border-[#0a0a0a14] pt-5">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-medium tracking-[-0.8px] tabular-nums">
                404
              </span>
              <span className="font-mono text-[10px] leading-[1.3] tracking-[0.3px] text-[#6a6a66] uppercase">
                código
                <br />
                de erro
              </span>
            </div>
            <div className="h-8 w-px bg-[#0a0a0a1a]" />
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-medium tracking-[-0.8px] tabular-nums">
                0
              </span>
              <span className="font-mono text-[10px] leading-[1.3] tracking-[0.3px] text-[#6a6a66] uppercase">
                páginas
                <br />
                encontradas
              </span>
            </div>
            <div className="h-8 w-px bg-[#0a0a0a1a]" />
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-medium tracking-[-0.8px] tabular-nums">
                1
              </span>
              <span className="font-mono text-[10px] leading-[1.3] tracking-[0.3px] text-[#6a6a66] uppercase">
                sugestão
                <br />
                de rota
              </span>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-[2] mt-2 px-4 pb-6 md:fixed md:inset-x-0 md:bottom-5 md:mt-0 md:px-10 md:pb-0">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row sm:gap-4">
          <span className="font-mono text-[11px] text-[#8a8a85]">
            © earlyCV · 2026
          </span>
          <div className="flex items-center gap-4 sm:gap-5">
            <Link className="text-xs text-[#6a6a66]" href="/">
              Início
            </Link>
            <Link className="text-xs text-[#6a6a66]" href="/adaptar">
              Adaptar
            </Link>
            <Link className="text-xs text-[#6a6a66]" href="/contato">
              Contato
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
