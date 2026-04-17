"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AppHeader } from "@/components/app-header";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { PageShell } from "@/components/page-shell";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";
import { getDownloadCtaCopy } from "@/lib/download-cta-copy";
import { getAuthStatus } from "@/lib/session-actions";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Deterministic int from a string seed — usado para mockar media_candidatos e candidatos_semana */
function seededInt(seed: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return min + (Math.abs(h) % (max - min + 1));
}

/** Distribui um orçamento fixo proporcionalmente entre itens, corrigindo arredondamentos */
function applyBudget<T extends { pontos: number }>(
  items: T[],
  budget: number,
): T[] {
  if (items.length === 0) return items;
  const total = items.reduce((s, i) => s + i.pontos, 0);
  if (total === 0) {
    const even = Math.floor(budget / items.length);
    const rest = budget - even * items.length;
    return items.map((item, idx) => ({
      ...item,
      pontos: even + (idx === items.length - 1 ? rest : 0),
    }));
  }
  const scaled = items.map((item) => ({
    ...item,
    pontos: Math.max(1, Math.round((item.pontos / total) * budget)),
  }));
  // Corrigir desvio de arredondamento no último item
  const scaledTotal = scaled.reduce((s, i) => s + i.pontos, 0);
  const diff = budget - scaledTotal;
  if (diff !== 0) {
    scaled[scaled.length - 1] = {
      ...scaled[scaled.length - 1],
      pontos: Math.max(1, scaled[scaled.length - 1].pontos + diff),
    };
  }
  return scaled;
}

const GUEST_VISIBLE = 2;

const GUEST_MOCK_POSITIVOS: Array<{ texto: string; pontos: number }> = [
  { texto: "Competência avançada diretamente alinhada à vaga", pontos: 8 },
  { texto: "Histórico comprovado de resultados mensuráveis", pontos: 7 },
  { texto: "Experiência em ambiente similar ao da empresa", pontos: 6 },
  { texto: "Perfil compatível com cultura e valores da vaga", pontos: 5 },
];

const GUEST_MOCK_AJUSTES: Array<{
  id: string;
  titulo: string;
  descricao: string;
  pontos: number;
  dica: string;
}> = [
  { id: "m0", titulo: "Otimização de destaque técnico identificada", descricao: "Competência-chave pouco evidenciada no perfil atual", pontos: 8, dica: "Ex.: Descreva impacto com dados reais" },
  { id: "m1", titulo: "Reformulação de impacto necessária", descricao: "Linguagem atual reduz compatibilidade com o ATS", pontos: 6, dica: "Ex.: Use verbos de ação com resultados concretos" },
  { id: "m2", titulo: "Reposicionamento de experiência sugerido", descricao: "Alinhamento com requisitos principais da vaga", pontos: 5, dica: "" },
  { id: "m3", titulo: "Ajuste de relevância recomendado", descricao: "Melhora visibilidade do perfil para recrutadores", pontos: 4, dica: "" },
];

const GUEST_MOCK_KW: Array<{ kw: string; pontos: number }> = [
  { kw: "tecnologia-principal", pontos: 6 },
  { kw: "habilidade-técnica", pontos: 5 },
  { kw: "ferramenta-exigida", pontos: 4 },
  { kw: "competência-chave", pontos: 4 },
  { kw: "experiência-necessária", pontos: 3 },
  { kw: "certificação-relevante", pontos: 2 },
];

const GUEST_MOCK_PROBLEMAS: Array<{
  tipo: "critico" | "atencao" | "ok";
  titulo: string;
  descricao: string;
  impacto: number;
}> = [
  { tipo: "critico", titulo: "Problema crítico identificado", descricao: "Impede leitura correta pelo sistema ATS", impacto: -4 },
  { tipo: "atencao", titulo: "Ponto de atenção encontrado", descricao: "Reduz compatibilidade com recrutadores", impacto: -2 },
  { tipo: "atencao", titulo: "Ajuste de formato recomendado", descricao: "Melhora visibilidade para triagem automática", impacto: -1 },
];

/** Normaliza dados de análise (novo formato ou legado) para o shape que a página usa */
function normalizeData(raw: CvAnalysisData) {
  const positivosRaw: Array<{ texto: string; pontos: number }> = raw.positivos
    ?.length
    ? raw.positivos
    : (raw.pontos_fortes ?? []).map((t, i) => ({
        texto: t,
        pontos: [12, 9, 8, 7, 5][i] ?? 5,
      }));

  const ajustesConteudoRaw: Array<{
    id: string;
    titulo: string;
    descricao: string;
    pontos: number;
    dica: string;
  }> = raw.ajustes_conteudo?.length
    ? raw.ajustes_conteudo.map((a, i) => ({ ...a, id: a.id ?? `a${i}` }))
    : (raw.lacunas ?? []).map((l, i) => ({
        id: `a${i}`,
        titulo: l,
        descricao: "",
        pontos: [11, 9, 7, 6, 5][i] ?? 5,
        dica: "",
      }));

  const kwPresentesRaw: Array<{ kw: string; pontos: number }> = raw.keywords
    ?.presentes?.length
    ? raw.keywords.presentes
    : (raw.ats_keywords?.presentes ?? []).map((kw) => ({ kw, pontos: 3 }));

  const kwAusentesRaw: Array<{ kw: string; pontos: number }> = raw.keywords
    ?.ausentes?.length
    ? raw.keywords.ausentes
    : (raw.ats_keywords?.ausentes ?? []).map((kw) => ({ kw, pontos: 4 }));

  // Normalizar Seção 1: positivos + ajustes devem somar exatamente 40 pts
  const s1All = applyBudget([...positivosRaw, ...ajustesConteudoRaw], 40);
  const positivos = s1All.slice(0, positivosRaw.length) as typeof positivosRaw;
  const ajustesConteudo = s1All.slice(positivosRaw.length) as typeof ajustesConteudoRaw;

  // Normalizar Seção 2: kw.presentes + kw.ausentes devem somar exatamente 40 pts
  const s2All = applyBudget([...kwPresentesRaw, ...kwAusentesRaw], 40);
  const kwPresentes = s2All.slice(0, kwPresentesRaw.length) as typeof kwPresentesRaw;
  const kwAusentes = s2All.slice(kwPresentesRaw.length) as typeof kwAusentesRaw;

  const scorePosAjustes =
    raw.fit.score_pos_ajustes ??
    raw.projecao_melhoria?.score_pos_otimizacao ??
    Math.min(raw.fit.score + 20, 95);

  const CAMPO_PTS: Record<string, number> = {
    "Nome completo": 2,
    "E-mail": 3,
    Telefone: 2,
    LinkedIn: 2,
    Localização: 1,
    "Resumo profissional": 3,
    "Formação acadêmica": 3,
    "Experiências com datas": 3,
    "Habilidades e Competências": 1,
  };

  const formatacaoScore = (() => {
    if (!raw.formato_cv) return 0;
    // Deduzir impactos negativos dos problemas de formato
    const problemasDeduction = raw.formato_cv.problemas.reduce(
      (s, p) => s + (p.impacto < 0 ? p.impacto : 0),
      0,
    );
    // Deduzir pontos dos campos ausentes
    const ptsFaltando = raw.formato_cv.campos
      .filter((c) => !c.presente)
      .reduce((s, c) => s + (CAMPO_PTS[c.nome] ?? 1), 0);
    return Math.max(0, 20 + problemasDeduction - ptsFaltando);
  })();

  const secoes = {
    experiencia: {
      score: positivos.reduce((s, p) => s + p.pontos, 0),
      max: 40,
    },
    competencias: {
      score: kwPresentes.reduce((s, k) => s + k.pontos, 0),
      max: 40,
    },
    formatacao: {
      score: formatacaoScore,
      max: 20,
    },
  };

  return {
    vaga: raw.vaga,
    fit: { ...raw.fit, score_pos_ajustes: scorePosAjustes },
    positivos,
    ajustes_conteudo: ajustesConteudo,
    keywords: { presentes: kwPresentes, ausentes: kwAusentes },
    formato_cv: raw.formato_cv ?? null,
    comparacao: raw.comparacao,
    preview: raw.preview ?? null,
    secoes,
  };
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  size = 140,
  label,
  dimmed = false,
}: {
  score: number;
  size?: number;
  label?: string;
  dimmed?: boolean;
}) {
  const radius = 44;
  const circ = 2 * Math.PI * radius;
  const fill = (score / 100) * circ;
  const color = dimmed
    ? "rgba(255,255,255,0.35)"
    : score >= 70
      ? "#84cc16"
      : score >= 40
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#ffffff12"
          strokeWidth="7"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeDashoffset={circ * 0.25}
          style={{
            transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={dimmed ? "26" : "30"}
          fontWeight="800"
          fill={dimmed ? "rgba(255,255,255,0.35)" : color}
          fontFamily="inherit"
        >
          {score}
        </text>
      </svg>
      {label && (
        <p
          className={`text-center text-[11px] font-semibold ${dimmed ? "text-white/30" : "text-white/50"}`}
        >
          {label}
        </p>
      )}
    </div>
  );
}

function AjusteRow({
  numero,
  titulo,
  descricao,
  dica,
  pontos,
  concluido = false,
}: {
  numero: number;
  titulo: string;
  descricao: string;
  dica?: string;
  pontos: number;
  concluido?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${concluido ? "bg-lime-50" : "bg-[#F8F8F8]"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            concluido
              ? "bg-lime-200 text-lime-700"
              : "bg-[#E8E8E8] text-[#AAAAAA]"
          }`}
        >
          {concluido ? "✓" : numero}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-sm font-semibold leading-snug ${concluido ? "text-lime-800" : "text-[#111]"}`}
            >
              {titulo}
            </p>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                concluido
                  ? "bg-lime-200 text-lime-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              +{pontos} pts
            </span>
          </div>
          {descricao && (
            <p
              className={`mt-0.5 text-xs leading-relaxed ${concluido ? "text-lime-700" : "text-[#666]"}`}
            >
              {descricao}
            </p>
          )}
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
            <div
              className={`h-full rounded-full transition-all duration-700 ${concluido ? "bg-lime-400" : "bg-[#CCCCCC]"}`}
              style={{ width: concluido ? "100%" : "0%" }}
            />
          </div>
          {!concluido && dica && (
            <p className="mt-2 text-[11px] italic text-[#AAAAAA]">{dica}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProblemaIcon({ tipo }: { tipo: "critico" | "atencao" | "ok" }) {
  if (tipo === "critico")
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600">
        !
      </span>
    );
  if (tipo === "atencao")
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-600">
        ~
      </span>
    );
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-100 text-sm font-bold text-lime-600">
      ✓
    </span>
  );
}

function SectionHeader({
  label,
  title,
  description,
  score,
  maxScore,
}: {
  label: string;
  title: string;
  description?: string;
  score?: number;
  maxScore?: number;
}) {
  const scoreColor =
    score === undefined || maxScore === undefined
      ? ""
      : score >= maxScore * 0.7
        ? "bg-lime-100 text-lime-700"
        : score >= maxScore * 0.4
          ? "bg-amber-100 text-amber-700"
          : "bg-red-100 text-red-700";

  return (
    <div className="px-1 pb-1 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#AAAAAA]">
          {label}
        </p>
        {score !== undefined && maxScore !== undefined && (
          <span
            className={`rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${scoreColor}`}
          >
            {score}/{maxScore} pts
          </span>
        )}
      </div>
      <h2 className="mt-1 text-lg font-bold text-[#111]">{title}</h2>
      {score !== undefined && maxScore !== undefined && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EEEEEE]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.round((score / maxScore) * 100)}%`,
              backgroundColor:
                score / maxScore >= 0.8
                  ? "#65a30d"
                  : score / maxScore >= 0.7
                    ? "#84cc16"
                    : score / maxScore >= 0.4
                      ? "#f59e0b"
                      : "#ef4444",
            }}
          />
        </div>
      )}
      {description && (
        <p className="mt-1.5 text-sm text-[#888]">{description}</p>
      )}
    </div>
  );
}

function GuestBlurOverlay({ children, count }: { children: ReactNode; count: number }) {
  return (
    <div className="relative mt-2 overflow-hidden rounded-xl">
      <div
        style={{ filter: "blur(5px)", userSelect: "none", pointerEvents: "none" }}
        aria-hidden="true"
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-white/60 to-white/95" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-[#E0E0E0] bg-white px-4 py-3 shadow-sm">
          <span className="text-2xl leading-none">🔒</span>
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] font-bold text-[#555]">
              {count} {count === 1 ? "item bloqueado" : "itens bloqueados"}
            </p>
            <p className="text-[11px] font-semibold text-[#888]">Crie conta para liberar.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

const RELEASE_POPUP_FADE_MS = 260;

type GuestAnalysisStored = {
  adaptedContentJson: CvAnalysisData;
  previewText?: string;
  jobDescriptionText?: string;
  masterCvText?: string;
};

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function ResultadoPage() {
  const router = useRouter();

  // Análise
  const [rawData, setRawData] = useState<CvAnalysisData | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("adaptationId")) return null;
    const stored = sessionStorage.getItem("guestAnalysis");
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as GuestAnalysisStored;
      return parsed?.adaptedContentJson ?? null;
    } catch {
      return null;
    }
  });

  // Auth / pagamento
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasCredits, setHasCredits] = useState<boolean | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [reviewAdaptationId, setReviewAdaptationId] = useState<string | null>(
    null,
  );
  const [reviewPaymentStatus, setReviewPaymentStatus] = useState<
    "none" | "pending" | "completed" | "failed" | "refunded" | null
  >(null);

  // Interação
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const [showReleasePopup, setShowReleasePopup] = useState(false);
  const [releasePopupVisible, setReleasePopupVisible] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    if (showReleasePopup) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isClient, showReleasePopup]);

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
        .then(async (res) => {
          if (!res.ok) throw new Error();
          return res.json() as Promise<{
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
          setRawData(payload.adaptedContentJson);
          setReviewPaymentStatus(payload.paymentStatus);
        })
        .catch(() => {
          setClaimError("Não foi possível carregar essa análise agora.");
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
      if (!parsed?.adaptedContentJson) throw new Error();
      setRawData(parsed.adaptedContentJson);
    } catch {
      sessionStorage.removeItem("guestAnalysis");
      router.replace("/adaptar");
    }
  }, [router]);

  // ── Handlers ──────────────────────────────────────────────

  const toggleKw = (kw: string) => {
    if (locked) return;
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  };

  const handleUseCredit = async () => {
    if (!hasCredits || claiming) return;
    const raw = sessionStorage.getItem("guestAnalysis");
    if (!raw) {
      setClaimError("Análise não encontrada. Reanalise seu CV.");
      return;
    }
    let parsed: GuestAnalysisStored;
    try {
      parsed = JSON.parse(raw) as GuestAnalysisStored;
    } catch {
      setClaimError("Não foi possível carregar sua análise. Reanalise seu CV.");
      return;
    }
    if (!parsed.masterCvText?.trim()) {
      setClaimError(
        "Análise em formato antigo. Reanalise seu CV para liberar o download.",
      );
      return;
    }

    setLocked(true);
    setClaiming(true);
    setClaimError(null);

    try {
      const res = await fetch("/api/cv-adaptation/claim-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          adaptedContentJson: parsed.adaptedContentJson as Record<
            string,
            unknown
          >,
          previewText: parsed.previewText,
          jobDescriptionText: parsed.jobDescriptionText ?? "",
          masterCvText: parsed.masterCvText ?? "",
          jobTitle: parsed.adaptedContentJson?.vaga?.cargo,
          companyName: parsed.adaptedContentJson?.vaga?.empresa,
        }),
      });
      if (!res.ok) {
        let message =
          "Não foi possível usar seu crédito agora. Tente novamente.";
        try {
          const body = (await res.json()) as { message?: string };
          if (typeof body.message === "string" && body.message.trim())
            message = body.message;
        } catch {
          /* fallback */
        }
        throw new Error(message);
      }
      const payload = (await res.json()) as {
        id?: string;
        paymentStatus?:
          | "none"
          | "pending"
          | "completed"
          | "failed"
          | "refunded";
      };
      if (payload.id) setReviewAdaptationId(payload.id);
      setReviewPaymentStatus(payload.paymentStatus ?? "completed");
      setHasCredits(false);
      setClaiming(false);
      setShowReleasePopup(true);
      requestAnimationFrame(() => setReleasePopupVisible(true));
      sessionStorage.removeItem("guestAnalysis");
    } catch (err) {
      setClaimError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Não foi possível usar seu crédito agora. Tente novamente.",
      );
      setClaiming(false);
      setLocked(false);
    }
  };

  const handleRedeemReview = async () => {
    if (!reviewAdaptationId || hasCredits !== true || claiming) return;
    setLocked(true);
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch(
        `/api/cv-adaptation/${reviewAdaptationId}/redeem-credit`,
        { method: "POST", cache: "no-store" },
      );
      if (!res.ok) throw new Error("Falha ao liberar");
      setReviewPaymentStatus("completed");
      setClaiming(false);
    } catch {
      setClaimError("Não foi possível liberar o CV agora. Tente novamente.");
      setClaiming(false);
      setLocked(false);
    }
  };

  const handleDownload = async (format: "pdf" | "docx") => {
    if (!reviewAdaptationId || downloading) return;
    // Fecha o popup de liberação imediatamente para dar lugar ao overlay de progresso
    if (showReleasePopup) {
      setReleasePopupVisible(false);
      setShowReleasePopup(false);
    }
    setDownloading(format);
    setClaimError(null);
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${reviewAdaptationId}/download?format=${format}`,
        fallbackFilename: `cv-adaptado.${format}`,
        onStageChange: setDownloadStage,
      });
    } catch {
      setClaimError(
        "Não foi possível baixar o arquivo agora. Tente novamente.",
      );
    } finally {
      setDownloading(null);
      setDownloadStage(null);
    }
  };

  const handleCloseReleasePopup = () => {
    setReleasePopupVisible(false);
    window.setTimeout(() => setShowReleasePopup(false), RELEASE_POPUP_FADE_MS);
  };

  // ── Loading ────────────────────────────────────────────────

  if (!rawData) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#F0F0F0]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────

  const data = normalizeData(rawData);
  const isGuestView = isAuthenticated !== true;
  const vagaSeed = `${data.vaga.cargo}::${data.vaga.empresa}`;
  const mediaScore = seededInt(vagaSeed, 78, 85);
  const candidatosSemana = seededInt(`${vagaSeed}:w`, 28, 61);
  const scoreMinimo = 80;

  const scoreColor =
    data.fit.score >= 70
      ? "#84cc16"
      : data.fit.score >= 40
        ? "#f59e0b"
        : "#ef4444";

  const delta = data.fit.score - mediaScore;
  const ptsFaltamMinimo = Math.max(0, scoreMinimo - data.fit.score);
  const ptsKwSelecionadas = data.keywords.ausentes
    .filter((k) => selecionadas.has(k.kw))
    .reduce((s, k) => s + k.pontos, 0);

  const totalAjustesConteudo = data.ajustes_conteudo.reduce(
    (s, a) => s + a.pontos,
    0,
  );
  const totalKwAusentes = data.keywords.ausentes.reduce(
    (s, k) => s + k.pontos,
    0,
  );
  const totalAjustes =
    data.ajustes_conteudo.length + data.keywords.ausentes.length;
  const maxPos = Math.max(...data.positivos.map((p) => p.pontos), 1);

  // Score projetado calculado inteiramente dos itens exibidos — garante que
  // selecionar/deselecionar keywords sempre afete o número de forma visível
  const scoreProjetado = Math.min(
    data.fit.score + totalAjustesConteudo + ptsKwSelecionadas,
    100,
  );
  const scoreMaxPossivel = Math.min(
    data.fit.score + totalAjustesConteudo + totalKwAusentes,
    100,
  );

  // Formato CV derivados
  const criticos =
    data.formato_cv?.problemas.filter((p) => p.tipo === "critico") ?? [];
  const atencoes =
    data.formato_cv?.problemas.filter((p) => p.tipo === "atencao") ?? [];
  const oks = data.formato_cv?.problemas.filter((p) => p.tipo === "ok") ?? [];
  const camposPresentes =
    data.formato_cv?.campos.filter((c) => c.presente).length ?? 0;

  // Estado do CTA
  const isDownloadReady =
    reviewAdaptationId !== null && reviewPaymentStatus === "completed";

  return (
    <PageShell>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[#F0F0F0]"
      />
      <main className="min-h-screen text-[#111]">
        <AppHeader
          userName={userName}
          logoSize="sm"
          backgroundColor="#F0F0F0"
        />

        <div className="mx-auto max-w-[1140px] space-y-3 px-6 pb-28 pt-2">
          {/* ── Hero ── */}
          <div className="overflow-hidden rounded-2xl bg-[#111] text-white">
            <div className="flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-evenly">
              <div className="min-w-0">
                <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white/50">
                  Resultado da análise
                </span>
                <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
                  {data.vaga.cargo}
                </h1>
                <p className="mt-1 text-base text-white/50">
                  {data.vaga.empresa}
                </p>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
                  {data.fit.headline}
                </p>

                <div className="mt-6 inline-flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                      Score atual
                    </p>
                    <p
                      className="mt-0.5 text-2xl font-bold tabular-nums"
                      style={{ color: scoreColor }}
                    >
                      {data.fit.score}
                    </p>
                  </div>
                  <span className="text-xl text-white/30">→</span>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                      Com ajustes
                    </p>
                    <p className="mt-0.5 text-2xl font-bold tabular-nums text-lime-400">
                      {scoreMaxPossivel}
                    </p>
                  </div>
                  <span className="ml-1 rounded-lg bg-lime-500/20 px-2.5 py-1 text-xs font-bold text-lime-400">
                    +{scoreMaxPossivel - data.fit.score} pts possíveis
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-center gap-4">
                <div className="flex items-center gap-3">
                  <ScoreRing
                    score={data.fit.score}
                    size={148}
                    label="Seu score"
                  />
                  <span className="px-1 text-[11px] font-bold uppercase tracking-widest text-white/20">
                    vs
                  </span>
                  <ScoreRing
                    score={mediaScore}
                    size={112}
                    label="Média da vaga"
                    dimmed
                  />
                </div>
                <div
                  className={`w-full rounded-xl px-4 py-3 text-center ${delta < 0 ? "bg-red-500/20" : "bg-lime-500/20"}`}
                >
                  <p
                    className={`text-2xl font-extrabold tabular-nums ${delta < 0 ? "text-red-400" : "text-lime-400"}`}
                  >
                    {delta < 0 ? "" : "+"}
                    {delta} pts
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-white/50">
                    {delta < 0
                      ? "abaixo da média dos candidatos"
                      : "acima da média dos candidatos"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Alerta de competição ── */}
          <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <span className="mt-0.5 text-lg leading-none">⚠️</span>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {candidatosSemana} candidatos já analisaram esta vaga nesta
                semana
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                Vagas como essa recebem centenas de candidaturas. Recrutadores
                priorizam os CVs com maior compatibilidade — e você está{" "}
                {Math.abs(delta)} pts {delta < 0 ? "abaixo" : "acima"} da média
                agora.{" "}
                <strong>
                  Seu CV otimizado já está pronto. Cada hora conta.
                </strong>
              </p>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 1 — Experiência Profissional
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="Seção 1 — Experiência Profissional"
            title="O que já está a seu favor"
            description="Pontos do seu perfil que contribuem positivamente para esta vaga."
            score={data.secoes.experiencia.score}
            maxScore={data.secoes.experiencia.max}
          />

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-100">
                <span className="text-base font-bold text-lime-600">✓</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111]">
                  Pontos fortes identificados
                </p>
                <p className="text-[11px] text-[#999]">
                  contribuem positivamente para o seu score
                </p>
              </div>
              <span className="ml-auto rounded-lg bg-lime-50 px-2.5 py-1 text-xs font-bold text-lime-700">
                +{data.positivos.reduce((s, p) => s + p.pontos, 0)} pts
              </span>
            </div>
            <div className="space-y-4">
              {data.positivos.slice(0, GUEST_VISIBLE).map((item) => (
                <div key={item.texto}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-snug text-[#333]">
                      {item.texto}
                    </p>
                    <span className="shrink-0 rounded-md bg-lime-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-lime-700">
                      +{item.pontos}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                    <div
                      className="h-full rounded-full bg-lime-400 transition-all duration-500"
                      style={{
                        width: `${Math.round((item.pontos / maxPos) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {isGuestView && data.positivos.length > GUEST_VISIBLE && (
              <GuestBlurOverlay count={Math.min(data.positivos.length - GUEST_VISIBLE, GUEST_MOCK_POSITIVOS.length)}>
                <div className="space-y-4">
                  {GUEST_MOCK_POSITIVOS.slice(0, Math.min(data.positivos.length - GUEST_VISIBLE, GUEST_MOCK_POSITIVOS.length)).map((item) => (
                    <div key={item.texto}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm leading-snug text-[#333]">{item.texto}</p>
                        <span className="shrink-0 rounded-md bg-lime-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-lime-700">
                          +{item.pontos}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                        <div className="h-full rounded-full bg-lime-400 transition-all duration-500" style={{ width: `${Math.round((item.pontos / maxPos) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </GuestBlurOverlay>
            )}
          </div>

          {/* Ajustes de conteúdo — parte do orçamento de 40 pts da Seção 1 */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <span className="text-base leading-none">🎯</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111]">
                  Ajustes de conteúdo
                </p>
                <p className="text-[11px] text-[#999]">
                  lacunas que o EarlyCV corrige no seu CV otimizado
                </p>
              </div>
              <span className="ml-auto rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                +{totalAjustesConteudo} pts
              </span>
            </div>
            <div className="space-y-3">
              {data.ajustes_conteudo.slice(0, GUEST_VISIBLE).map((a, i) => (
                <AjusteRow
                  key={a.id}
                  numero={i + 1}
                  titulo={a.titulo}
                  descricao={a.descricao}
                  dica={a.dica}
                  pontos={a.pontos}
                  concluido={false}
                />
              ))}
            </div>
            {isGuestView && data.ajustes_conteudo.length > GUEST_VISIBLE && (
              <GuestBlurOverlay count={Math.min(data.ajustes_conteudo.length - GUEST_VISIBLE, GUEST_MOCK_AJUSTES.length)}>
                <div className="space-y-3">
                  {GUEST_MOCK_AJUSTES.slice(0, Math.min(data.ajustes_conteudo.length - GUEST_VISIBLE, GUEST_MOCK_AJUSTES.length)).map((a, i) => (
                    <AjusteRow
                      key={a.id}
                      numero={GUEST_VISIBLE + i + 1}
                      titulo={a.titulo}
                      descricao={a.descricao}
                      dica={a.dica}
                      pontos={a.pontos}
                      concluido={false}
                    />
                  ))}
                </div>
              </GuestBlurOverlay>
            )}
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
              <span className="text-sm">🔒</span>
              <p className="text-xs font-semibold text-amber-800">
                Libere seu CV otimizado para aplicar todos os{" "}
                {data.ajustes_conteudo.length} ajustes de conteúdo
                automaticamente.
              </p>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 2 — Competências Técnicas
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="Seção 2 — Competências Técnicas"
            title="Palavras-chave da vaga"
            description="Termos que o ATS desta vaga busca no seu CV — presentes e ausentes."
            score={data.secoes.competencias.score}
            maxScore={data.secoes.competencias.max}
          />

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#111] px-6 py-4 text-white">
            <div>
              <p className="text-sm font-bold">
                {data.keywords.presentes.length + data.keywords.ausentes.length}{" "}
                keywords identificadas para esta vaga
              </p>
              <p className="mt-0.5 text-xs text-white/50">
                Libere o CV para inserir as{" "}
                <span className="font-bold text-lime-400">
                  {data.keywords.ausentes.length} que faltam
                </span>{" "}
                no contexto certo e ganhar até{" "}
                <span className="font-bold text-lime-400">
                  +{totalKwAusentes} pts
                </span>
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-lime-500/20 px-4 py-2 text-center">
              <span className="block text-xl font-extrabold tabular-nums text-lime-400">
                +{totalKwAusentes}
              </span>
              <span className="text-[10px] font-semibold text-lime-400/70">
                pts em jogo
              </span>
            </span>
          </div>

          {/* Palavras-chave da vaga */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <span className="text-base leading-none">🔑</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111]">
                  Palavras-chave da vaga
                </p>
                <p className="text-[11px] text-[#999]">
                  termos que o ATS desta vaga busca no seu CV
                </p>
              </div>
              <span className="ml-auto rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                +{totalKwAusentes} pts disponíveis
              </span>
            </div>

            {/* Presentes */}
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-lime-600">
              Já no seu CV ({data.keywords.presentes.length})
            </p>
            <div className="mb-5 space-y-2">
              {data.keywords.presentes.slice(0, GUEST_VISIBLE).map((k) => (
                <AjusteRow
                  key={k.kw}
                  numero={0}
                  titulo={k.kw}
                  descricao="Palavra-chave identificada no seu currículo."
                  pontos={k.pontos}
                  concluido
                />
              ))}
              {isGuestView && data.keywords.presentes.length > GUEST_VISIBLE && (
                <GuestBlurOverlay count={Math.min(data.keywords.presentes.length - GUEST_VISIBLE, GUEST_MOCK_KW.length)}>
                  <div className="space-y-2">
                    {GUEST_MOCK_KW.slice(0, Math.min(data.keywords.presentes.length - GUEST_VISIBLE, GUEST_MOCK_KW.length)).map((k) => (
                      <AjusteRow
                        key={k.kw}
                        numero={0}
                        titulo={k.kw}
                        descricao="Palavra-chave identificada no seu currículo."
                        pontos={k.pontos}
                        concluido
                      />
                    ))}
                  </div>
                </GuestBlurOverlay>
              )}
            </div>

            {/* Faltando — selecionáveis */}
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-amber-600">
              Faltando no seu CV ({data.keywords.ausentes.length})
            </p>
            <p className="mb-3 text-xs text-[#888]">
              Selecione quais você deseja incluir. Seu CV otimizado só
              adicionará as que você aprovar.
            </p>

            <div className="space-y-2">
              {data.keywords.ausentes.slice(0, GUEST_VISIBLE).map((k) => {
                const sel = selecionadas.has(k.kw);
                return (
                  <label
                    key={k.kw}
                    className={`flex items-center gap-3 rounded-xl p-3.5 transition-colors ${
                      locked ? "cursor-default" : "cursor-pointer"
                    } ${
                      sel
                        ? "bg-lime-50 ring-1 ring-lime-300"
                        : "bg-red-50 ring-1 ring-red-200 hover:bg-red-100"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                        sel
                          ? "border-lime-500 bg-lime-500"
                          : "border-red-300 bg-white"
                      }`}
                    >
                      {sel && (
                        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative checkbox tick
                        <svg
                          width="10"
                          height="8"
                          viewBox="0 0 10 8"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M1 4l3 3 5-6"
                            stroke="white"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={sel}
                      onChange={() => toggleKw(k.kw)}
                    />
                    <span
                      className={`flex-1 text-sm font-semibold ${sel ? "text-lime-800" : "text-red-700"}`}
                    >
                      {k.kw}
                    </span>
                    <div className="w-20 shrink-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#E5E5E5]">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${sel ? "bg-lime-400" : "bg-red-300"}`}
                          style={{ width: sel ? "100%" : "0%" }}
                        />
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                        sel
                          ? "bg-lime-200 text-lime-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      +{k.pontos} pts
                    </span>
                  </label>
                );
              })}
              {isGuestView && data.keywords.ausentes.length > GUEST_VISIBLE && (
                <GuestBlurOverlay count={Math.min(data.keywords.ausentes.length - GUEST_VISIBLE, GUEST_MOCK_KW.length)}>
                  <div className="space-y-2">
                    {GUEST_MOCK_KW.slice(0, Math.min(data.keywords.ausentes.length - GUEST_VISIBLE, GUEST_MOCK_KW.length)).map((k) => (
                      <div
                        key={k.kw}
                        className="flex items-center gap-3 rounded-xl bg-red-50 p-3.5 ring-1 ring-red-200"
                      >
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-red-300 bg-white" />
                        <span className="flex-1 text-sm font-semibold text-red-700">{k.kw}</span>
                        <div className="w-20 shrink-0">
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#E5E5E5]">
                            <div className="h-full w-0 rounded-full bg-red-300" />
                          </div>
                        </div>
                        <span className="shrink-0 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-red-700">
                          +{k.pontos} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </GuestBlurOverlay>
              )}
            </div>

            {selecionadas.size > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-lime-50 px-4 py-3 ring-1 ring-lime-200">
                <div>
                  <p className="text-sm font-bold text-lime-800">
                    {selecionadas.size} palavra
                    {selecionadas.size > 1 ? "s" : ""}-chave selecionada
                    {selecionadas.size > 1 ? "s" : ""}
                  </p>
                  <p className="text-[11px] text-lime-600">
                    Serão incluídas no seu CV otimizado ao liberar
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-lime-200 px-3 py-1.5 text-sm font-extrabold text-lime-800">
                  +{ptsKwSelecionadas} pts
                </span>
              </div>
            )}

            {selecionadas.size === 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
                <span className="text-sm">🔒</span>
                <p className="text-xs font-semibold text-amber-800">
                  Selecione as palavras-chave que deseja incluir e libere seu CV
                  otimizado.
                </p>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 3 — Formato do CV (opcional, presente em análises novas)
          ════════════════════════════════════════════════════ */}
          <>
            <SectionHeader
              label="Seção 3 — Formatação e Campos"
              title="Análise do formato do seu CV"
              description="Como os sistemas de triagem automática (ATS) leem e interpretam o seu arquivo."
              score={data.secoes.formatacao.score}
              maxScore={data.secoes.formatacao.max}
            />

            {data.formato_cv ? (
              <>
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  {/* Compatibilidade com ATS — item simples */}
                  <div
                    className={`mb-4 flex items-start gap-3 rounded-xl p-3 ${
                      data.secoes.formatacao.score >= 14
                        ? "bg-lime-50"
                        : data.secoes.formatacao.score >= 8
                          ? "bg-amber-50"
                          : "bg-red-50"
                    }`}
                  >
                    <ProblemaIcon
                      tipo={
                        data.secoes.formatacao.score >= 14
                          ? "ok"
                          : data.secoes.formatacao.score >= 8
                            ? "atencao"
                            : "critico"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#111]">
                          Compatibilidade com ATS
                        </p>
                        <span
                          className={`shrink-0 text-[11px] font-bold tabular-nums ${
                            data.secoes.formatacao.score >= 14
                              ? "text-lime-700"
                              : data.secoes.formatacao.score >= 8
                                ? "text-amber-700"
                                : "text-red-700"
                          }`}
                        >
                          {data.secoes.formatacao.score}/20 pts
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[#666]">
                        {data.formato_cv.resumo}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#111]">
                      Problemas encontrados
                    </p>
                    {criticos.length > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        {criticos.length} crítico
                        {criticos.length > 1 ? "s" : ""}
                      </span>
                    )}
                    {atencoes.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                        {atencoes.length} atenção
                      </span>
                    )}
                    {oks.length > 0 && (
                      <span className="rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-bold text-lime-600">
                        {oks.length} ok
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {data.formato_cv.problemas.length === 0 && (
                      <div className="flex items-center gap-3 rounded-xl bg-lime-50 p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-100 text-sm font-bold text-lime-600">
                          ✓
                        </span>
                        <p className="text-sm font-semibold text-lime-700">
                          Tudo ok — nenhum problema de formato encontrado
                        </p>
                      </div>
                    )}
                    {data.formato_cv.problemas.slice(0, GUEST_VISIBLE).map((p) => (
                      <div
                        key={p.titulo}
                        className={`flex gap-3 rounded-xl p-3 ${p.tipo === "critico" ? "bg-red-50" : p.tipo === "atencao" ? "bg-amber-50" : "bg-lime-50"}`}
                      >
                        <ProblemaIcon tipo={p.tipo} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#111]">
                              {p.titulo}
                            </p>
                            {p.impacto !== 0 && (
                              <span
                                className={`shrink-0 text-[11px] font-bold tabular-nums ${p.impacto > 0 ? "text-lime-600" : "text-red-600"}`}
                              >
                                {p.impacto > 0 ? "+" : ""}
                                {p.impacto} pts
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-[#666]">
                            {p.descricao}
                          </p>
                        </div>
                      </div>
                    ))}
                    {isGuestView && data.formato_cv.problemas.length > GUEST_VISIBLE && (
                      <GuestBlurOverlay count={Math.min(data.formato_cv.problemas.length - GUEST_VISIBLE, GUEST_MOCK_PROBLEMAS.length)}>
                        <div className="space-y-3">
                          {GUEST_MOCK_PROBLEMAS.slice(0, Math.min(data.formato_cv.problemas.length - GUEST_VISIBLE, GUEST_MOCK_PROBLEMAS.length)).map((p) => (
                            <div
                              key={p.titulo}
                              className={`flex gap-3 rounded-xl p-3 ${p.tipo === "critico" ? "bg-red-50" : "bg-amber-50"}`}
                            >
                              <ProblemaIcon tipo={p.tipo} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-[#111]">{p.titulo}</p>
                                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-red-600">
                                    {p.impacto} pts
                                  </span>
                                </div>
                                <p className="mt-0.5 text-xs leading-relaxed text-[#666]">{p.descricao}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </GuestBlurOverlay>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  {(() => {
                    const CAMPO_PTS: Record<string, number> = {
                      "Nome completo": 2,
                      "E-mail": 3,
                      Telefone: 2,
                      LinkedIn: 2,
                      Localização: 1,
                      "Resumo profissional": 3,
                      "Formação acadêmica": 3,
                      "Experiências com datas": 3,
                      "Habilidades e Competências": 1,
                    };
                    const ptsFaltando = data
                      .formato_cv!.campos.filter((c) => !c.presente)
                      .reduce((s, c) => s + (CAMPO_PTS[c.nome] ?? 1), 0);
                    return (
                      <>
                        <div className="mb-4 flex items-center justify-between">
                          <p className="text-sm font-bold text-[#111]">
                            Campos do currículo
                          </p>
                          {ptsFaltando > 0 ? (
                            <span className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                              -{ptsFaltando} pts
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-[#AAAAAA]">
                              {camposPresentes}/{data.formato_cv!.campos.length}{" "}
                              encontrados
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {data.formato_cv!.campos.map((campo) => {
                            const pts = CAMPO_PTS[campo.nome] ?? 1;
                            return (
                              <div
                                key={campo.nome}
                                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${
                                  campo.presente ? "bg-lime-50" : "bg-red-50"
                                }`}
                              >
                                <span
                                  className={`text-xs font-bold ${
                                    campo.presente
                                      ? "text-lime-600"
                                      : "text-red-400"
                                  }`}
                                >
                                  {campo.presente ? "✓" : "✕"}
                                </span>
                                <span
                                  className={`flex-1 text-xs ${
                                    campo.presente
                                      ? "text-[#333]"
                                      : "text-red-700"
                                  }`}
                                >
                                  {campo.nome}
                                </span>
                                {!campo.presente && (
                                  <span className="shrink-0 text-[10px] font-bold tabular-nums text-red-500">
                                    -{pts}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            ) : (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                <p className="text-sm font-semibold text-[#333]">
                  Análise de formato não incluída nesta análise
                </p>
                <p className="mt-1 text-xs text-[#888]">
                  Refaça a análise para obter a avaliação completa de ATS e
                  compatibilidade de formato.
                </p>
                <a
                  href="/adaptar"
                  style={{ color: "#ffffff" }}
                  className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-[#111] px-5 text-xs font-semibold"
                >
                  Refazer análise
                </a>
              </div>
            )}
          </>

          {/* ── Preview ── */}
          {data.preview && (
            <>
              <SectionHeader
                label="Prévia"
                title="Como seu CV ficará depois da otimização"
                description="Veja como o EarlyCV reescreve uma experiência para passar no ATS e chamar atenção do recrutador."
              />

              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#EEEEEE] bg-[#FAFAFA] p-5">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                      Antes
                    </p>
                    <p className="text-sm leading-relaxed text-[#555]">
                      {data.preview.antes}
                    </p>
                  </div>
                  <div className="relative rounded-xl border border-lime-200 bg-lime-50 p-5">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-lime-700">
                      Depois (otimizado)
                    </p>
                    <p className="text-sm leading-relaxed text-[#1a1a1a] [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]">
                      {data.preview.depois}
                    </p>
                    <div className="absolute inset-0 flex items-end justify-center rounded-xl pb-5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-300 bg-white px-3 py-1.5 text-[11px] font-bold text-[#333] shadow-sm">
                        🔒 Disponível após liberar o CV
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── CTA ── */}
          <div className="overflow-hidden rounded-2xl bg-[#0E0E0E]">
            {ptsFaltamMinimo > 0 && (
              <div className="flex items-center gap-3 bg-red-600/90 px-6 py-3">
                <span className="text-sm">⚡</span>
                <p className="text-sm font-bold text-white">
                  Você está a {ptsFaltamMinimo} pts do score mínimo recomendado
                  para ser chamado para entrevista
                </p>
              </div>
            )}

            <div className="p-8 md:p-10">
              <div className="grid gap-8 md:grid-cols-2 md:items-start">
                {/* Coluna esquerda — copy */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">
                    Não deixe para depois
                  </p>
                  <h2 className="mt-2 text-2xl font-bold leading-snug text-white">
                    Seu CV otimizado já está pronto — falta só você liberar
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    Enquanto você decide, outros candidatos já estão enviando
                    CVs otimizados para esta mesma vaga. Candidatos com score
                    acima de 80 têm{" "}
                    <span className="font-bold text-white/90">
                      3× mais chances de ser chamados para entrevista.
                    </span>
                  </p>

                  {/* Score threshold bar */}
                  <div className="mt-5 rounded-xl bg-white/8 p-4">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-white/40">Seu score atual</span>
                      <span className="text-white/40">Score recomendado</span>
                    </div>
                    <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-amber-400"
                        style={{ width: `${data.fit.score}%` }}
                      />
                      <div
                        className="absolute inset-y-0 w-0.5 bg-lime-400"
                        style={{ left: `${scoreMinimo}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className="text-lg font-extrabold tabular-nums"
                        style={{ color: scoreColor }}
                      >
                        {data.fit.score}
                      </span>
                      <span className="rounded-md bg-lime-500/20 px-2 py-0.5 text-xs font-bold text-lime-400">
                        meta: {scoreMinimo}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-5 space-y-2.5">
                    {[
                      `${data.ajustes_conteudo.length} ajustes de conteúdo prontos para aplicar`,
                      `${selecionadas.size > 0 ? selecionadas.size : data.keywords.ausentes.length} palavras-chave da vaga inseridas no contexto certo`,
                      "Formato validado para sistemas ATS — sem colunas, sem tabelas",
                      "Download em PDF e DOCX prontos para enviar hoje",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2.5 text-sm text-white/80"
                      >
                        <span className="text-lime-400">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Coluna direita — score projetado + CTA */}
                <div className="flex flex-col gap-3 md:pt-2">
                  {/* Score projetado */}
                  <div className="rounded-xl bg-lime-500/15 px-5 py-4 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-lime-400/70">
                      Seu score após liberar
                    </p>
                    <p className="mt-1 text-4xl font-extrabold tabular-nums text-lime-400">
                      {scoreProjetado}
                    </p>
                    {/* Breakdown da conta */}
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[11px] text-white/35">
                      <span className="tabular-nums">{data.fit.score}</span>
                      <span>+{totalAjustesConteudo} ajustes</span>
                      {ptsKwSelecionadas > 0 && (
                        <span>+{ptsKwSelecionadas} palavras</span>
                      )}
                      <span className="font-bold text-white/50">
                        = {scoreProjetado}/100
                      </span>
                    </div>
                    {scoreProjetado >= 100 && (
                      <p className="mt-1 text-[10px] text-lime-400/60">
                        score máximo atingido
                      </p>
                    )}
                  </div>

                  {/* Botões — variam por estado de auth/pagamento */}
                  {isDownloadReady ? (
                    /* Downloads disponíveis */
                    <>
                      <button
                        type="button"
                        onClick={() => handleDownload("pdf")}
                        disabled={downloading !== null}
                        style={{ color: "#0E0E0E" }}
                        className="w-full rounded-xl bg-white py-4 text-base font-bold leading-none transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-75"
                      >
                        {getDownloadCtaCopy("pdf", downloading)}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload("docx")}
                        disabled={downloading !== null}
                        style={{ color: "#0E0E0E" }}
                        className="w-full rounded-xl bg-white py-4 text-base font-bold leading-none transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-75"
                      >
                        {getDownloadCtaCopy("docx", downloading)}
                      </button>
                    </>
                  ) : isAuthenticated === false ? (
                    /* Não autenticado */
                    <>
                      <a
                        href="/entrar?next=/adaptar/resultado"
                        style={{ color: "#0E0E0E" }}
                        className="w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100"
                      >
                        Criar conta e liberar minha análise grátis
                      </a>
                      <p className="text-center text-xs text-white/30">
                        Leva menos de 1 minuto. Sem cartão.
                      </p>
                    </>
                  ) : isAuthenticated === null ? (
                    /* Carregando auth */
                    <div className="h-14 animate-pulse rounded-xl bg-white/10" />
                  ) : reviewAdaptationId &&
                    reviewPaymentStatus !== "completed" ? (
                    /* Modo revisão — ainda não pago */
                    hasCredits === true ? (
                      <button
                        type="button"
                        onClick={handleRedeemReview}
                        disabled={claiming}
                        style={{ color: "#0E0E0E" }}
                        className="w-full rounded-xl bg-white py-4 text-base font-bold leading-none transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {claiming
                          ? "Liberando CV..."
                          : "Liberar CV com 1 crédito"}
                      </button>
                    ) : (
                      <a
                        href="/planos"
                        style={{ color: "#0E0E0E" }}
                        className="w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100"
                      >
                        Comprar créditos
                      </a>
                    )
                  ) : hasCredits === false ? (
                    /* Autenticado sem créditos */
                    <a
                      href="/planos"
                      style={{ color: "#0E0E0E" }}
                      className="w-full rounded-xl bg-white py-4 text-center text-base font-bold leading-none transition-colors hover:bg-stone-100"
                    >
                      Ver pacotes para liberar seu CV adaptado
                    </a>
                  ) : (
                    /* Autenticado com crédito — ação principal */
                    <button
                      type="button"
                      onClick={handleUseCredit}
                      disabled={hasCredits !== true || claiming}
                      style={{ color: "#0E0E0E" }}
                      className="w-full rounded-xl bg-white py-4 text-base font-bold leading-none transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {claiming
                        ? "Liberando CV..."
                        : "Liberar meu CV otimizado agora"}
                    </button>
                  )}

                  {!isDownloadReady && isAuthenticated !== false && (
                    <button
                      type="button"
                      onClick={() => window.location.assign("/planos")}
                      className="w-full rounded-xl bg-white/10 py-3.5 text-sm font-bold leading-none text-white/70 transition-colors hover:bg-white/15"
                    >
                      Ver pacotes de créditos
                    </button>
                  )}

                  <p className="rounded-xl bg-white/8 px-4 py-3 text-center text-sm font-semibold text-white/70">
                    Após liberar, os{" "}
                    <span className="text-lime-400">
                      {totalAjustes} ajustes
                    </span>{" "}
                    são aplicados automaticamente.
                  </p>

                  {claimError && (
                    <p className="text-center text-sm text-red-300">
                      {claimError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {/* ── Release popup ── */}
      {showReleasePopup &&
        isClient &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex h-dvh w-screen items-center justify-center overflow-y-auto bg-black/35 px-4 transition-opacity duration-[260ms] ease-out"
            style={{ opacity: releasePopupVisible ? 1 : 0 }}
          >
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={handleCloseReleasePopup}
              className="absolute inset-0"
            />
            <div
              className="relative w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-2xl transition-all duration-[260ms] ease-out"
              style={{
                opacity: releasePopupVisible ? 1 : 0,
                transform: releasePopupVisible
                  ? "translateY(0) scale(1)"
                  : "translateY(8px) scale(0.98)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-[#111111]">
                    CV liberado para download
                  </p>
                  <p className="mt-1 text-sm text-[#555555]">
                    Seu CV final já está pronto. Escolha o formato para baixar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseReleasePopup}
                  className="rounded-md p-1.5 text-[#777777] transition-colors hover:bg-[#F2F2F2] hover:text-[#111111]"
                  aria-label="Fechar aviso"
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleDownload("pdf")}
                  disabled={downloading !== null || !reviewAdaptationId}
                  style={{ color: "#0E0E0E" }}
                  className="w-full rounded-xl bg-[#F7F7F7] py-3.5 text-sm font-bold leading-none transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {getDownloadCtaCopy("pdf", downloading)}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload("docx")}
                  disabled={downloading !== null || !reviewAdaptationId}
                  style={{ color: "#0E0E0E" }}
                  className="w-full rounded-xl bg-[#F7F7F7] py-3.5 text-sm font-bold leading-none transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {getDownloadCtaCopy("docx", downloading)}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      <DownloadProgressOverlay
        open={downloadStage !== null}
        stage={downloadStage}
        format={downloading}
      />
    </PageShell>
  );
}
