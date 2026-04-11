"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import {
  type CvAnalysisData,
  claimGuestAnalysis,
} from "@/lib/cv-adaptation-api";
import { getDownloadCtaCopy } from "@/lib/download-cta-copy";
import { getAuthStatus } from "@/lib/session-actions";

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
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
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
        {scoreTarget !== undefined && scoreTarget > score && (
          <div
            className="absolute inset-y-0 w-[3px] bg-lime-400"
            style={{ left: `calc(${scoreTarget}% - 1.5px)` }}
          />
        )}
      </div>

      <div className="relative mt-2 h-5 w-full text-[10px] font-semibold">
        <span className="absolute left-0 text-[#AAAAAA]">0</span>
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

const MOCK_BLURRED_ITEMS = [
  "Domínio comprovado em metodologias ágeis",
  "Liderança de squads multidisciplinares",
  "Resultados mensuráveis em projetos críticos",
  "Experiência com ferramentas de alto impacto",
  "Histórico de entregas em ambientes complexos",
  "Comunicação eficaz com stakeholders técnicos",
  "Capacidade de priorização e gestão de escopo",
  "Visão de produto orientada a dados",
  "Adaptação rápida a novos contextos",
  "Colaboração em times multidisciplinares",
];

type GuestAnalysisStored = {
  adaptedContentJson: CvAnalysisData;
  previewText?: string;
  jobDescriptionText?: string;
  masterCvText?: string;
};

// ── LockedList ────────────────────────────────────────────────────────────────
function LockedList({
  items,
  dot,
  isAuthenticated,
}: {
  items: string[];
  dot: string;
  isAuthenticated: boolean | null;
}) {
  if (isAuthenticated === null) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-4 w-3/4 animate-pulse rounded bg-[#EEEEEE]"
          />
        ))}
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2">
            <span
              className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ background: dot }}
            />
            <span className="text-sm leading-snug text-[#1a1a1a]">{item}</span>
          </div>
        ))}
      </div>
    );
  }

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
            <span className="flex items-center gap-2 rounded-full border border-[#E0E0E0] bg-white px-3 py-1.5">
              <span className="text-base leading-none">🔒</span>
              <span className="text-[11px] font-bold text-[#333]">
                +{lockedCount}{" "}
                {lockedCount === 1
                  ? "melhoria que pode aumentar seu score"
                  : "melhorias que podem aumentar seu score"}
              </span>
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
  const [data, setData] = useState<CvAnalysisData | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const adaptationId = params.get("adaptationId");

    if (adaptationId) {
      return null;
    }

    const stored = sessionStorage.getItem("guestAnalysis");
    if (!stored) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored) as GuestAnalysisStored;
      return parsed?.adaptedContentJson ?? null;
    } catch {
      return null;
    }
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasCredits, setHasCredits] = useState<boolean | null>(null);
  const [reviewAdaptationId, setReviewAdaptationId] = useState<string | null>(
    null,
  );
  const [reviewPaymentStatus, setReviewPaymentStatus] = useState<
    "none" | "pending" | "completed" | "failed" | "refunded" | null
  >(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adaptationId = params.get("adaptationId");

    getAuthStatus().then(
      ({ isAuthenticated: auth, userName: name, hasCredits }) => {
        setIsAuthenticated(auth);
        setUserName(name);
        setHasCredits(hasCredits);
      },
    );

    if (adaptationId) {
      setReviewAdaptationId(adaptationId);
      fetch(`/api/cv-adaptation/${adaptationId}/content`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Nao foi possivel carregar esta analise.");
          }
          return response.json() as Promise<{
            adaptedContentJson: CvAnalysisData;
            paymentStatus:
              | "none"
              | "pending"
              | "completed"
              | "failed"
              | "refunded";
          }>;
        })
        .then((payload) => {
          setData(payload.adaptedContentJson);
          setReviewPaymentStatus(payload.paymentStatus);
        })
        .catch(() => {
          setClaimError(
            "Nao foi possivel carregar essa analise agora. Tente novamente.",
          );
          router.replace("/dashboard");
        });
      return;
    }

    const stored = sessionStorage.getItem("guestAnalysis");
    if (!stored) {
      router.replace("/adaptar");
      return;
    }

    try {
      const parsed = JSON.parse(stored) as GuestAnalysisStored;
      if (!parsed?.adaptedContentJson) {
        throw new Error("guestAnalysis sem adaptedContentJson");
      }
      setData(parsed.adaptedContentJson);
    } catch {
      sessionStorage.removeItem("guestAnalysis");
      router.replace("/adaptar");
    }
  }, [router]);

  const handleUseCredit = async () => {
    if (!hasCredits || claiming) return;

    const raw = sessionStorage.getItem("guestAnalysis");
    if (!raw) {
      setClaimError("Nao encontramos a analise desta vaga. Reanalise seu CV.");
      return;
    }

    let parsed: GuestAnalysisStored;
    try {
      parsed = JSON.parse(raw) as GuestAnalysisStored;
    } catch {
      setClaimError("Nao foi possivel carregar sua analise. Reanalise seu CV.");
      return;
    }

    if (!parsed.masterCvText?.trim()) {
      setClaimError(
        "Sua analise esta em formato antigo. Reanalise seu CV para liberar o download.",
      );
      return;
    }

    setClaiming(true);
    setClaimError(null);

    try {
      await claimGuestAnalysis({
        adaptedContentJson: parsed.adaptedContentJson as Record<
          string,
          unknown
        >,
        previewText: parsed.previewText,
        jobDescriptionText: parsed.jobDescriptionText ?? "",
        masterCvText: parsed.masterCvText ?? "",
        jobTitle: parsed.adaptedContentJson?.vaga?.cargo,
        companyName: parsed.adaptedContentJson?.vaga?.empresa,
      });

      sessionStorage.removeItem("guestAnalysis");
      router.push("/dashboard");
    } catch {
      setClaimError(
        "Nao foi possivel usar seu credito agora. Tente novamente em instantes.",
      );
      setClaiming(false);
    }
  };

  const handleDownload = (format: "pdf" | "docx") => {
    if (!reviewAdaptationId || downloading) return;

    setDownloading(format);
    window.location.assign(
      `/api/cv-adaptation/${reviewAdaptationId}/download?format=${format}`,
    );

    setTimeout(() => {
      setDownloading(null);
    }, 5000);
  };

  const handleRedeemReview = async () => {
    if (!reviewAdaptationId || hasCredits !== true || claiming) return;

    setClaiming(true);
    setClaimError(null);

    try {
      const response = await fetch(
        `/api/cv-adaptation/${reviewAdaptationId}/redeem-credit`,
        {
          method: "POST",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Falha ao liberar");
      }

      setReviewPaymentStatus("completed");
      setClaiming(false);
    } catch {
      setClaimError("Nao foi possivel liberar o CV agora. Tente novamente.");
      setClaiming(false);
    }
  };

  if (!data) {
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center bg-[#F2F2F2] px-4 text-[#111]">
        <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
          <p className="text-sm font-medium text-[#555]">
            Carregando análise...
          </p>
        </div>
      </main>
    );
  }

  const scoreColor =
    data.fit.score >= 70
      ? "#84cc16"
      : data.fit.score >= 40
        ? "#f59e0b"
        : "#ef4444";

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[#F2F2F2]"
      />

      <main className="min-h-screen bg-[#F2F2F2] text-[#111]">
        <AppHeader userName={userName} logoSize="sm" />

        <div className="mx-auto max-w-[960px] space-y-3 px-4 pb-24 pt-1">
          {/* ── Banner de status (autenticado / teaser) ── */}
          {isAuthenticated === true && (
            <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-5 py-3">
              <span className="text-lime-600">✔</span>
              <p className="text-sm font-semibold text-lime-800">
                Análise completa liberada
              </p>
            </div>
          )}

          {isAuthenticated === false && (
            <div className="flex items-center justify-between gap-4 rounded-xl bg-[#111111] px-5 py-4">
              <p className="text-sm font-medium text-white">
                Crie uma conta para ver a análise completa
              </p>
              <a
                href="/entrar?next=/adaptar/resultado"
                style={{ color: "#111111" }}
                className="shrink-0 rounded-[10px] bg-white px-4 py-2 text-sm font-bold"
              >
                Criar conta grátis
              </a>
            </div>
          )}

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
                <p className="mt-4 bg-lime-50 px-5 py-3 text-base font-bold text-lime-800">
                  Você pode sair de{" "}
                  <span style={{ color: scoreColor }}>
                    {data.projecao_melhoria.score_atual}
                  </span>
                  {" → "}
                  <span className="text-lime-600">
                    {data.projecao_melhoria.score_pos_otimizacao}
                  </span>
                  {" com ajustes simples"}
                </p>
              )}
            </div>
          </div>

          {/* ── 2. Comparação antes/depois ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
                CV atual
              </p>
              <p className="text-sm font-medium text-[#1a1a1a]">
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
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime-100 text-xs">
                  ✓
                </span>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                  Pontos fortes
                </p>
              </div>
              <LockedList
                items={data.pontos_fortes}
                dot="#84cc16"
                isAuthenticated={isAuthenticated}
              />
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs">
                  ✗
                </span>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                  Lacunas
                </p>
              </div>
              <LockedList
                items={data.lacunas}
                dot="#ef4444"
                isAuthenticated={isAuthenticated}
              />
            </div>

            <div className="rounded-xl border border-lime-200 bg-lime-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime-200 text-xs font-bold text-lime-700">
                  ↑
                </span>
                <p className="text-[11px] font-bold uppercase tracking-widest text-lime-700">
                  Melhorias aplicadas
                </p>
              </div>
              <LockedList
                items={data.melhorias_aplicadas}
                dot="#84cc16"
                isAuthenticated={isAuthenticated}
              />
            </div>
          </div>

          {/* ── 4. ATS Keywords ── */}
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
                  {(isAuthenticated
                    ? data.ats_keywords.presentes
                    : data.ats_keywords.presentes.slice(0, 3)
                  ).map((kw) => (
                    <Chip key={kw} label={kw} variant="green" />
                  ))}
                  {!isAuthenticated &&
                    data.ats_keywords.presentes.length > 3 && (
                      <span className="inline-flex items-center rounded-full bg-[#F7F7F7] px-2.5 py-0.5 text-xs text-[#AAAAAA]">
                        🔒 +{data.ats_keywords.presentes.length - 3}
                      </span>
                    )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold text-red-600">
                  Faltando para essa vaga
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(isAuthenticated
                    ? data.ats_keywords.ausentes
                    : data.ats_keywords.ausentes.slice(0, 3)
                  ).map((kw) => (
                    <Chip key={kw} label={kw} variant="red" />
                  ))}
                  {!isAuthenticated &&
                    data.ats_keywords.ausentes.length > 3 && (
                      <span className="inline-flex items-center rounded-full bg-[#F7F7F7] px-2.5 py-0.5 text-xs text-[#AAAAAA]">
                        🔒 +{data.ats_keywords.ausentes.length - 3}
                      </span>
                    )}
                </div>
              </div>
            </div>
          </div>

          {/* ── 5. Preview antes/depois ── */}
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
                {isAuthenticated ? (
                  <div className="relative">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-[#1a1a1a] [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]">
                      {data.preview.depois}
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-lime-600">
                      ↓ Esse é o padrão aplicado em todo o seu CV otimizado
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="line-clamp-3 select-none text-sm leading-relaxed text-[#555] blur-[3px]">
                      {data.preview.depois}
                    </p>
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-lime-50/60">
                      <span className="rounded-full border border-lime-200 bg-white px-3 py-1 text-[11px] font-bold text-[#333] shadow-sm">
                        🔒 Bloqueado
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-[12px] font-semibold text-[#1a1a1a]">
              <svg
                aria-hidden="true"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Formato aplicado em um template validado para passar em sistemas
              ATS
            </p>
          </div>

          {/* ── 6. CTA RESULTADO BLOQUEADO — guest ou não autenticado ── */}
          {isAuthenticated !== true && (
            <div className="rounded-[20px] bg-[#0E0E0E] px-8 py-8">
              <p className="text-xl font-bold text-white">
                Sua análise completa já está pronta
              </p>
              <p className="mt-2 text-sm text-white/60">
                Veja exatamente como corrigir os pontos que estão te eliminando
              </p>

              <p className="mt-6 text-[11px] font-bold uppercase tracking-widest text-white/40">
                Ao continuar, você verá:
              </p>
              <ul className="mt-3 space-y-2">
                {[
                  "Veja todas as melhorias detalhadas",
                  "Saiba como corrigir cada problema",
                  "Acesse seu CV ajustado para a vaga",
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

              <p className="mt-5 flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm italic text-white/70">
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 not-italic"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                "Quanto antes ajustar, maiores suas chances nessa vaga."
              </p>

              <a
                href="/entrar?next=/adaptar/resultado"
                style={{ color: "#0E0E0E" }}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100"
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
                Ver análise completa grátis
              </a>

              <p className="mt-4 text-center text-sm text-white/60">
                Leva menos de 1 minuto. Sem cartão.
              </p>
            </div>
          )}

          {/* ── 6. CTA RESULTADO LIBERADO — autenticado ── */}
          {isAuthenticated === true && (
            <div className="rounded-[20px] bg-[#0E0E0E] px-8 py-8">
              <p className="text-xl font-bold text-white">
                {reviewAdaptationId && reviewPaymentStatus === "completed"
                  ? "Sua analise completa esta liberada"
                  : reviewAdaptationId
                    ? "Sua analise esta pronta para liberar o CV"
                    : "Seu CV otimizado ja esta pronto para ser liberado"}
              </p>
              <p className="mt-2 text-sm text-white/60">
                {reviewAdaptationId && reviewPaymentStatus === "completed"
                  ? "Baixe agora seu CV nos formatos PDF ou DOCX."
                  : reviewAdaptationId
                    ? "Use 1 credito para liberar o CV final e os downloads."
                    : "Use seu credito agora e siga para a versao final com download."}
              </p>

              <p className="mt-5 rounded-lg bg-white/10 px-4 py-2 text-sm italic text-white/70">
                {reviewAdaptationId
                  ? '"Com a analise pronta, escolha o formato e envie seu CV hoje."'
                  : '"Voce ja viu os ajustes. Agora libere o CV final e envie com confianca."'}
              </p>

              <p className="mt-6 text-[11px] font-bold uppercase tracking-widest text-white/40">
                {reviewAdaptationId && reviewPaymentStatus === "completed"
                  ? "Opcoes de download"
                  : reviewAdaptationId
                    ? "Ao liberar com credito, voce recebe:"
                    : "Ao usar seu credito, voce recebe:"}
              </p>
              <ul className="mt-3 space-y-2">
                {[
                  reviewAdaptationId && reviewPaymentStatus === "completed"
                    ? "Download em PDF para envio rapido"
                    : "CV final adaptado para esta vaga",
                  reviewAdaptationId && reviewPaymentStatus === "completed"
                    ? "Download em DOCX para editar"
                    : "Download imediato em PDF e DOCX",
                  reviewAdaptationId && reviewPaymentStatus === "completed"
                    ? "Versao pronta para candidatura"
                    : "Resumo pronto para aplicar sem retrabalho",
                  reviewAdaptationId && reviewPaymentStatus === "completed"
                    ? "Arquivo reutilizavel para outras vagas"
                    : "Modelo reutilizavel para proximas candidaturas",
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
                {reviewAdaptationId && reviewPaymentStatus === "completed"
                  ? "Escolha o formato e baixe agora"
                  : reviewAdaptationId
                    ? "Liberar CV com 1 credito"
                    : hasCredits === false
                      ? "Voce esta sem creditos no momento"
                      : "Libere agora o CV que voce pode enviar hoje"}
              </p>

              {reviewAdaptationId && reviewPaymentStatus === "completed" ? (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleDownload("pdf")}
                    disabled={downloading !== null}
                    style={{ color: "#0E0E0E" }}
                    className="block w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-75"
                  >
                    {getDownloadCtaCopy("pdf", downloading)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload("docx")}
                    disabled={downloading !== null}
                    style={{ color: "#0E0E0E" }}
                    className="block w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-75"
                  >
                    {getDownloadCtaCopy("docx", downloading)}
                  </button>
                </div>
              ) : reviewAdaptationId ? (
                hasCredits === true ? (
                  <button
                    type="button"
                    onClick={handleRedeemReview}
                    disabled={claiming}
                    style={{ color: "#0E0E0E" }}
                    className="mt-6 block w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {claiming ? "Liberando CV..." : "Liberar CV com 1 credito"}
                  </button>
                ) : (
                  <a
                    href="/planos"
                    style={{ color: "#0E0E0E" }}
                    className="mt-6 block w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100"
                  >
                    Comprar creditos
                  </a>
                )
              ) : hasCredits === false ? (
                <a
                  href="/planos"
                  style={{ color: "#0E0E0E" }}
                  className="mt-6 block w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100"
                >
                  Ver planos para continuar
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleUseCredit}
                  disabled={hasCredits !== true || claiming}
                  style={{ color: "#0E0E0E" }}
                  className="mt-6 block w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {claiming
                    ? "Usando seu credito..."
                    : "Usar meu credito e liberar CV"}
                </button>
              )}

              <p className="mt-2 text-center text-sm text-white/60">
                {reviewAdaptationId && reviewPaymentStatus === "completed"
                  ? "Se preferir, voce pode voltar ao dashboard para rever outras analises."
                  : reviewAdaptationId
                    ? "Depois de liberar, os downloads em PDF e DOCX ficam disponiveis imediatamente."
                    : hasCredits === false
                      ? "Compre um plano para gerar o download final."
                      : "Depois disso, voce vai direto para ver e baixar seu CV."}
              </p>
              {claimError && (
                <p className="mt-2 text-center text-sm text-red-300">
                  {claimError}
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
