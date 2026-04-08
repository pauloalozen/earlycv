"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

// ── ScoreBar ──────────────────────────────────────────────────────────────────
function ScoreBar({
  score,
  scoreTarget,
}: {
  score: number;
  scoreTarget?: number;
}) {
  return (
    <div className="w-full px-2">
      {/* Track */}
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
        {/* Gradient fill clipped by score */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${score}%`,
            background:
              "linear-gradient(to right, #ef4444 0%, #f59e0b 50%, #84cc16 100%)",
            backgroundSize: "100vw 100%",
            backgroundPosition: "left center",
          }}
        />
        {/* Projected target marker — lime dashed line inside track */}
        {scoreTarget !== undefined && scoreTarget > score && (
          <div
            className="absolute inset-y-0 w-[3px] bg-lime-400"
            style={{ left: `calc(${scoreTarget}% - 1.5px)` }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="relative mt-2 h-5 w-full text-[10px] font-semibold">
        <span className="absolute left-0 text-[#AAAAAA]">0</span>
        {/* Current score pin */}
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{
            left: `${score}%`,
            color:
              score >= 70 ? "#84cc16" : score >= 40 ? "#f59e0b" : "#ef4444",
          }}
        >
          {score}
        </span>
        {/* Target pin */}
        {scoreTarget !== undefined && scoreTarget > score && (
          <span
            className="group absolute -translate-x-1/2 cursor-help whitespace-nowrap"
            style={{ left: `${scoreTarget}%` }}
          >
            <span className="rounded bg-lime-100 px-2 py-0.5 text-base font-bold text-lime-700 ring-1 ring-lime-300">
              {scoreTarget}
            </span>
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-[#111] px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Score possível após ajustes
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#111]" />
            </span>
          </span>
        )}
        <span className="absolute right-0 text-[#AAAAAA]">100</span>
      </div>
    </div>
  );
}

// Texto fictício exibido borrado — nunca expõe dados reais no DOM
const MOCK_BLURRED_ITEMS = [
  "Domínio comprovado em metodologias ágeis",
  "Liderança de squads multidisciplinares",
  "Resultados mensuráveis em projetos críticos",
];

// ── Locked bullet list ────────────────────────────────────────────────────────
function LockedList({ items, dot }: { items: string[]; dot: string }) {
  const visible = items.slice(0, 1);
  const lockedCount = Math.max(0, items.length - 1);

  return (
    <div className="space-y-3">
      {visible.map((item) => (
        <div key={item} className="flex items-start gap-2">
          <span
            className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
            style={{ background: dot }}
          />
          <span className="text-sm leading-snug text-[#1a1a1a]">{item}</span>
        </div>
      ))}

      {lockedCount > 0 && (
        <div className="relative mt-1 overflow-hidden rounded-lg">
          <div className="space-y-3 select-none blur-[5px]">
            {MOCK_BLURRED_ITEMS.slice(0, lockedCount).map((mock) => (
              <div key={mock} className="flex items-start gap-2">
                <span
                  className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ background: dot }}
                />
                <span className="text-sm leading-snug text-[#1a1a1a]">
                  {mock}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center gap-1.5 rounded-full border border-[#E0E0E0] bg-white px-3 py-1.5 text-[11px] font-bold text-[#333]">
              🔒 +{lockedCount} melhorias adicionais bloqueadas
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────
function Chip({ label, variant }: { label: string; variant: "green" | "red" }) {
  return variant === "green" ? (
    <span className="inline-flex items-center rounded-full bg-lime-100 px-2.5 py-0.5 text-xs font-semibold text-lime-800">
      {label}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
      {label}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ResultadoPage() {
  const router = useRouter();
  const [data, setData] = useState<CvAnalysisData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("guestAnalysis");
    if (!stored) {
      router.replace("/adaptar");
      return;
    }
    const parsed = JSON.parse(stored) as { adaptedContentJson: CvAnalysisData };
    setData(parsed.adaptedContentJson);
  }, [router]);

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0E0E0E]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </main>
    );
  }

  const scoreColor =
    data.fit.score >= 70
      ? "#84cc16"
      : data.fit.score >= 40
        ? "#f59e0b"
        : "#ef4444";

  const categoriaLabel =
    data.fit.categoria === "alto"
      ? "Fit alto"
      : data.fit.categoria === "medio"
        ? "Fit médio"
        : "Fit baixo";

  return (
    <main className="min-h-screen bg-[#F2F2F2] text-[#111]">
      {/* Header */}
      <header className="flex items-center px-8 py-5">
        <a
          href="/"
          style={{ color: "#111" }}
          className="font-logo text-xl tracking-tight"
        >
          earlyCV
        </a>
      </header>

      <div className="mx-auto max-w-[960px] space-y-3 px-4 pb-24 pt-1">
        {/* ── 0. Cargo + empresa ── */}
        <div className="px-1 pb-1">
          <h1 className="text-2xl font-bold tracking-tight text-[#111]">
            Análise para vaga: {data.vaga?.cargo}
          </h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-[#AAAAAA]">
            Empresa: {data.vaga?.empresa}
          </p>
        </div>

        {/* ── 1. Score hero ── */}
        <div className="overflow-hidden rounded-[20px] bg-white shadow-sm">
          <div className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
            <div className="flex items-end gap-2">
              <span
                className="text-[72px] font-bold leading-none tabular-nums"
                style={{ color: scoreColor }}
              >
                {data.fit.score}
              </span>
              <span className="mb-3 text-2xl font-light text-[#CCCCCC]">
                /100
              </span>
            </div>

            <p className="mt-4 text-xl font-bold leading-snug text-[#111]">
              {data.fit.headline}
            </p>
            <p className="mt-2 max-w-sm text-sm text-[#888]">
              {data.fit.subheadline}
            </p>

            <div className="mt-6 w-full">
              <ScoreBar
                score={data.fit.score}
                scoreTarget={data.projecao_melhoria?.score_pos_otimizacao}
              />
            </div>

            {data.projecao_melhoria && (
              <p className="mt-3 rounded-lg bg-lime-50 px-4 py-2 text-sm font-semibold text-lime-700">
                {data.projecao_melhoria.explicacao_curta}
              </p>
            )}
          </div>
        </div>

        {/* ── 2. Comparação antes/depois ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#BBBBBB]">
              CV atual
            </p>
            <p className="text-sm font-medium text-[#666]">
              {data.comparacao.antes}
            </p>
          </div>
          <div className="rounded-xl border border-lime-200 bg-lime-50 p-4 shadow-sm">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-lime-600">
              CV otimizado
            </p>
            <p className="text-sm font-medium text-[#1a1a1a]">
              {data.comparacao.depois}
            </p>
          </div>
        </div>

        {/* ── 3. Diagnóstico 3 cards ── */}
        <div className="grid gap-3 md:grid-cols-3">
          {/* Pontos fortes */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime-100 text-xs">
                ✓
              </span>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                Pontos fortes
              </p>
            </div>
            <LockedList items={data.pontos_fortes} dot="#84cc16" />
          </div>

          {/* Lacunas */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs">
                ✗
              </span>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                Lacunas
              </p>
            </div>
            <LockedList items={data.lacunas} dot="#ef4444" />
          </div>

          {/* Melhorias */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs">
                ↑
              </span>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                Melhorias
              </p>
            </div>
            <LockedList items={data.melhorias_aplicadas} dot="#3b82f6" />
          </div>
        </div>

        {/* ── 3. ATS Keywords ── */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
            Palavras-chave ATS
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold text-lime-600">
                Presentes no CV
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.ats_keywords.presentes.map((kw) => (
                  <Chip key={kw} label={kw} variant="green" />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold text-red-600">
                Faltando para essa vaga
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.ats_keywords.ausentes.map((kw) => (
                  <Chip key={kw} label={kw} variant="red" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. Preview antes/depois ── */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
            Preview do CV ajustado
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-[#F7F7F7] p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#666]">
                Antes
              </p>
              <p className="line-clamp-3 text-sm leading-relaxed text-[#444]">
                {data.preview.antes}
              </p>
            </div>
            <div className="relative rounded-xl bg-lime-50 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-lime-700">
                Depois
              </p>
              <p className="line-clamp-3 select-none text-sm leading-relaxed text-[#555] blur-[3px]">
                {data.preview.depois}
              </p>
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-lime-50/60">
                <span className="rounded-full border border-lime-200 bg-white px-3 py-1 text-[11px] font-bold text-[#333] shadow-sm">
                  🔒 Bloqueado
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5. CTA ── */}
        <div className="rounded-[20px] bg-[#0E0E0E] px-8 py-8">
          <p className="text-xl font-bold text-white">
            Seu CV atual não está competitivo — mas já existe uma versão melhor
            pronta
          </p>
          <p className="mt-2 text-sm text-white/60">
            Mais alinhado com o que a empresa busca e com maior chance de passar
            na triagem
          </p>

          <p className="mt-6 text-[11px] font-bold uppercase tracking-widest text-white/40">
            Ao liberar, você recebe:
          </p>
          <ul className="mt-3 space-y-2">
            {[
              "CV otimizado para esta vaga",
              "Análise completa com pontos fracos claros",
              "Melhorias aplicadas prontas para uso",
              "Download imediato em PDF e DOCX",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2.5 text-sm text-white/80"
              >
                <span className="text-[#84cc16]">✓</span>
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-7 text-center text-lg font-bold text-white">
            Este é o CV que você deveria estar enviando hoje
          </p>

          <button
            type="button"
            style={{ color: "#0E0E0E" }}
            className="mt-6 w-full rounded-xl bg-white py-4 text-base font-bold leading-none transition-colors hover:bg-stone-100"
            onClick={() => alert("Checkout em breve!")}
          >
            Baixar agora meu CV otimizado — R$19
          </button>

          <p className="mt-2 text-center text-sm text-white/60">
            Acesso imediato após pagamento
          </p>

          <button
            type="button"
            onClick={() => router.push("/adaptar")}
            className="mt-4 w-full text-sm text-white/50 transition-colors hover:text-white/80"
          >
            Analisar outro CV
          </button>
        </div>
      </div>
    </main>
  );
}
