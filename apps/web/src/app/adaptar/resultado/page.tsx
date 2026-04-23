"use client";

import { useRouter } from "next/navigation";
import React, { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppHeader } from "@/components/app-header";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { PageShell } from "@/components/page-shell";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";
import {
  emitBusinessFunnelEvent,
  saveGuestPreview,
} from "@/lib/cv-adaptation-api";
import { getDownloadCtaCopy } from "@/lib/download-cta-copy";
import { getAuthStatus } from "@/lib/session-actions";
import { shouldPersistGuestAnalysis } from "./guest-analysis-persistence";
import { normalizeData } from "./normalize-data";

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function seededInt(seed: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return min + (Math.abs(h) % (max - min + 1));
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
  {
    id: "m0",
    titulo: "Otimização de destaque técnico identificada",
    descricao: "Competência-chave pouco evidenciada no perfil atual",
    pontos: 8,
    dica: "Ex.: Descreva impacto com dados reais",
  },
  {
    id: "m1",
    titulo: "Reformulação de impacto necessária",
    descricao: "Linguagem atual reduz compatibilidade com o ATS",
    pontos: 6,
    dica: "Ex.: Use verbos de ação com resultados concretos",
  },
  {
    id: "m2",
    titulo: "Reposicionamento de experiência sugerido",
    descricao: "Alinhamento com requisitos principais da vaga",
    pontos: 5,
    dica: "",
  },
  {
    id: "m3",
    titulo: "Ajuste de relevância recomendado",
    descricao: "Melhora visibilidade do perfil para recrutadores",
    pontos: 4,
    dica: "",
  },
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
  {
    tipo: "critico",
    titulo: "Problema crítico identificado",
    descricao: "Impede leitura correta pelo sistema ATS",
    impacto: -4,
  },
  {
    tipo: "atencao",
    titulo: "Ponto de atenção encontrado",
    descricao: "Reduz compatibilidade com recrutadores",
    impacto: -2,
  },
  {
    tipo: "atencao",
    titulo: "Ajuste de formato recomendado",
    descricao: "Melhora visibilidade para triagem automática",
    impacto: -1,
  },
];

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function GuestBlurOverlay({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        marginTop: 8,
        overflow: "hidden",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          filter: "blur(5px)",
          userSelect: "none",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, transparent, rgba(250,250,246,0.7) 40%, rgba(250,250,246,0.97))",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "#fff",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 16,
            padding: "10px 16px",
            boxShadow: "0 4px 16px rgba(10,10,10,0.08)",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>🔒</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 600,
                color: "#555",
                margin: 0,
              }}
            >
              {count} {count === 1 ? "item bloqueado" : "itens bloqueados"}
            </p>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                color: "#8a8a85",
                margin: 0,
              }}
            >
              Crie conta para liberar.
            </p>
          </div>
        </div>
      </div>
    </div>
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
  const pct =
    score !== undefined && maxScore !== undefined
      ? score / maxScore
      : undefined;
  const barColor =
    pct === undefined
      ? "#c6ff3a"
      : pct >= 0.75
        ? "#c6ff3a"
        : pct >= 0.4
          ? "#f59e0b"
          : "#ef4444";
  const badgeBg =
    pct === undefined
      ? "rgba(198,255,58,0.2)"
      : pct >= 0.75
        ? "rgba(198,255,58,0.2)"
        : pct >= 0.4
          ? "rgba(245,158,11,0.12)"
          : "rgba(239,68,68,0.1)";
  const badgeColor =
    pct === undefined
      ? "#405410"
      : pct >= 0.75
        ? "#405410"
        : pct >= 0.4
          ? "#92400e"
          : "#991b1b";

  return (
    <div style={{ paddingTop: 32, paddingBottom: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#8a8a85",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        {score !== undefined && maxScore !== undefined && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 500,
              color: badgeColor,
              background: badgeBg,
              padding: "3px 8px",
              borderRadius: 6,
            }}
          >
            {score}/{maxScore} pts
          </span>
        )}
      </div>
      <h2
        style={{
          fontFamily: GEIST,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: -0.8,
          color: "#0a0a0a",
          margin: "0 0 8px",
        }}
      >
        {title}
      </h2>
      {pct !== undefined && (
        <div
          style={{
            height: 3,
            background: "rgba(10,10,10,0.06)",
            borderRadius: 99,
            overflow: "hidden",
            marginBottom: 6,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(pct * 100)}%`,
              background: barColor,
              borderRadius: 99,
              transition: "width 0.7s",
            }}
          />
        </div>
      )}
      {description && (
        <p
          style={{
            fontFamily: GEIST,
            fontSize: 13.5,
            color: "#6a6560",
            lineHeight: 1.5,
            margin: "4px 0 0",
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}

function IssueIcon({ tipo }: { tipo: "critico" | "atencao" | "ok" }) {
  const map = {
    critico: { bg: "#0a0a0a", color: "#fff", text: "!" },
    atencao: { bg: "#f59e0b", color: "#fff", text: "~" },
    ok: { bg: "rgba(198,255,58,0.35)", color: "#405410", text: "✓" },
  };
  const m = map[tipo];
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: m.bg,
        color: m.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {m.text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Types + constants
// ─────────────────────────────────────────────────────────────

const RELEASE_POPUP_FADE_MS = 260;

type GuestAnalysisStored = {
  adaptedContentJson: CvAnalysisData;
  previewText?: string;
  jobDescriptionText?: string;
  masterCvText?: string;
};

const CARD: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 14,
  padding: "20px 22px",
};

const CAMPO_PTS_MAP: Record<string, number> = {
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

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function ResultadoPage() {
  const router = useRouter();

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

  const [isDemo, setIsDemo] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const autoSaveAttempted = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsDemo(params.get("demo") === "1");
    setAutoSave(params.get("autoSave") === "1");
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasCredits, setHasCredits] = useState<boolean | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [reviewAdaptationId, setReviewAdaptationId] = useState<string | null>(
    null,
  );
  const [reviewPaymentStatus, setReviewPaymentStatus] = useState<
    "none" | "pending" | "completed" | "failed" | "refunded" | null
  >(null);

  const [jobAnalysisCount, setJobAnalysisCount] = useState<number | null>(null);

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
            jobAnalysisCount?: number;
            adaptationNotes?: string | null;
          }>;
        })
        .then((payload) => {
          setRawData(payload.adaptedContentJson);
          setReviewPaymentStatus(payload.paymentStatus);
          setJobAnalysisCount(payload.jobAnalysisCount ?? null);
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
      const { cargo, empresa } = parsed.adaptedContentJson.vaga;
      fetch(
        `/api/cv-adaptation/job-count?jobTitle=${encodeURIComponent(cargo)}&companyName=${encodeURIComponent(empresa)}`,
        { cache: "no-store" },
      )
        .then((r) => r.json() as Promise<{ count: number }>)
        .then((body) => setJobAnalysisCount(body.count))
        .catch(() => {});
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
          /**/
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

  // Vincular análise da sessão ao usuário recém-criado (autoSave=1 na URL)
  // Usa saveGuestPreview — não consome crédito, apenas salva no histórico
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot effect guarded by ref
  useEffect(() => {
    if (
      !shouldPersistGuestAnalysis({
        autoSave,
        hasRawData: Boolean(rawData),
        hasReviewAdaptationId: Boolean(reviewAdaptationId),
        isAuthenticated: isAuthenticated === true,
        persistenceAlreadyAttempted: autoSaveAttempted.current,
      })
    ) {
      return;
    }

    const raw = sessionStorage.getItem("guestAnalysis");
    if (!raw) return;

    let parsed: GuestAnalysisStored;
    try {
      parsed = JSON.parse(raw) as GuestAnalysisStored;
    } catch {
      return;
    }
    if (!parsed.masterCvText?.trim()) return;

    autoSaveAttempted.current = true;

    saveGuestPreview({
      adaptedContentJson: parsed.adaptedContentJson as Record<string, unknown>,
      previewText: parsed.previewText,
      jobDescriptionText: parsed.jobDescriptionText ?? "",
      masterCvText: parsed.masterCvText,
      jobTitle: parsed.adaptedContentJson?.vaga?.cargo,
      companyName: parsed.adaptedContentJson?.vaga?.empresa,
    })
      .then((result) => {
        setReviewAdaptationId(result.id);
        setReviewPaymentStatus(result.paymentStatus ?? "none");
        sessionStorage.removeItem("guestAnalysis");
      })
      .catch(() => {
        // falha silenciosa — análise continua visível na sessão
      });
  }, [autoSave, isAuthenticated, rawData, reviewAdaptationId]);

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

  const emitResultadoEvent = (
    eventName: string,
    metadata?: Record<string, unknown>,
  ) => {
    const routeVisitId =
      sessionStorage.getItem("journey_current_route_visit_id") ??
      `${window.location.pathname}:${Date.now()}`;
    const previousRoute = sessionStorage.getItem("journey_previous_route");
    void emitBusinessFunnelEvent({
      eventName,
      eventVersion: 1,
      idempotencyKey: `${routeVisitId}:${eventName}`,
      metadata: {
        occurredAt: new Date().toISOString(),
        previous_route: previousRoute,
        route: window.location.pathname,
        routeVisitId,
        sessionInternalId: sessionStorage.getItem(
          "journey_session_internal_id",
        ),
        userId: null,
        ...metadata,
      },
    }).catch(() => undefined);
  };

  const handleDownload = async (format: "pdf" | "docx") => {
    if (!reviewAdaptationId || downloading) return;
    emitResultadoEvent("download_cv_clicked", { format });
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
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "2px solid rgba(10,10,10,0.1)",
            borderTopColor: "#0a0a0a",
            animation: "res-spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes res-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────

  const data = normalizeData(rawData);
  const isGuestView = isAuthenticated !== true && !isDemo;
  const vagaSeed = `${data.vaga.cargo}::${data.vaga.empresa}`;
  const mediaScore = seededInt(vagaSeed, 78, 85);
  const scoreMinimo = 80;

  const delta = data.fit.score - mediaScore;
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

  const scoreProjetado = Math.min(
    data.fit.score + totalAjustesConteudo + ptsKwSelecionadas,
    100,
  );
  const scoreMaxPossivel = Math.min(
    data.fit.score + totalAjustesConteudo + totalKwAusentes,
    100,
  );

  const criticos =
    data.formato_cv?.problemas.filter((p) => p.tipo === "critico") ?? [];
  const atencoes =
    data.formato_cv?.problemas.filter((p) => p.tipo === "atencao") ?? [];
  const oks = data.formato_cv?.problemas.filter((p) => p.tipo === "ok") ?? [];
  const camposPresentes =
    data.formato_cv?.campos.filter((c) => c.presente).length ?? 0;
  const ptsFaltando =
    data.formato_cv?.campos
      .filter((c) => !c.presente)
      .reduce((s, c) => s + (CAMPO_PTS_MAP[c.nome] ?? 1), 0) ?? 0;

  const isDownloadReady =
    reviewAdaptationId !== null && reviewPaymentStatus === "completed";

  const adaptationNotes = rawData?.adaptation_notes ?? null;

  // Gauge constants
  const R_GAUGE = 78;
  const C_GAUGE = 2 * Math.PI * R_GAUGE;
  const dashScore = C_GAUGE * (data.fit.score / 100);
  const dashProjected = C_GAUGE * (scoreMaxPossivel / 100);
  const ptsPositivos = data.positivos.reduce((s, p) => s + p.pontos, 0);

  return (
    <PageShell>
      {/* Grain */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.45,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      <main
        style={{
          fontFamily: GEIST,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          minHeight: "100dvh",
          position: "relative",
          color: "#0a0a0a",
        }}
      >
        <AppHeader userName={userName} />

        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 32px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* ── Hero ── */}
          <div
            className="res-hero"
            style={{
              display: "grid",
              gridTemplateColumns: "1.25fr 0.75fr",
              gap: 40,
              alignItems: "center",
              marginBottom: 28,
            }}
          >
            {/* Left — copy */}
            <div>
              {/* Kicker */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: MONO,
                  fontSize: 10.5,
                  letterSpacing: 1.2,
                  fontWeight: 500,
                  color: "#555",
                  background: "rgba(10,10,10,0.04)",
                  border: "1px solid rgba(10,10,10,0.06)",
                  padding: "6px 10px",
                  borderRadius: 999,
                  marginBottom: 20,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#c6ff3a",
                    boxShadow: "0 0 6px #c6ff3a",
                    display: "inline-block",
                    animation: "res-pulse 1.4s infinite",
                  }}
                />
                RELATÓRIO · {data.vaga.cargo.toUpperCase()} ·{" "}
                {data.vaga.empresa.toUpperCase()}
              </div>

              {/* H1 */}
              <h1
                style={{
                  fontSize: "clamp(38px, 4vw, 54px)",
                  fontWeight: 500,
                  letterSpacing: -2.2,
                  lineHeight: 1.02,
                  margin: "0 0 16px",
                  color: "#0a0a0a",
                }}
              >
                Análise completa{" "}
                <em
                  style={{
                    fontFamily: SERIF_ITALIC,
                    fontStyle: "italic",
                    fontWeight: 400,
                  }}
                >
                  do seu CV.
                </em>
              </h1>

              {/* Headline */}
              <p
                style={{
                  fontSize: 16,
                  color: "#45443e",
                  lineHeight: 1.55,
                  maxWidth: 520,
                  marginBottom: 28,
                }}
              >
                {data.fit.headline}
              </p>

              {/* Meta row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(10,10,10,0.08)",
                }}
              >
                {[
                  { num: String(data.fit.score), label: "score\natual" },
                  {
                    num: `+${scoreMaxPossivel - data.fit.score}`,
                    label: "pts\ndisponíveis",
                  },
                  {
                    num: String(totalAjustes),
                    label: "ajustes\nidentificados",
                  },
                ].map((item, i) => (
                  <React.Fragment key={`${item.num}-${item.label}`}>
                    {i > 0 && (
                      <div
                        style={{
                          width: 1,
                          height: 38,
                          background: "rgba(10,10,10,0.1)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 28,
                          fontWeight: 500,
                          letterSpacing: -1.2,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {item.num}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#6a6a66",
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                          lineHeight: 1.25,
                          whiteSpace: "pre-line",
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Right — dark gauge card */}
            <div
              style={{
                background: "#0a0a0a",
                color: "#fff",
                borderRadius: 18,
                padding: "24px 28px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxShadow: "0 24px 60px -20px rgba(10,10,10,0.4)",
              }}
            >
              {/* Label */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  color: "#a0a098",
                  fontWeight: 500,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#c6ff3a",
                    display: "inline-block",
                    animation: "res-pulse 1.4s infinite",
                  }}
                />
                ATS SCORE · ATUAL
              </div>

              {/* Gauge */}
              <div
                style={{
                  position: "relative",
                  width: 200,
                  height: 200,
                  marginBottom: 12,
                }}
              >
                {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden>
                  <circle
                    cx="100"
                    cy="100"
                    r={R_GAUGE}
                    stroke="#1a1a1a"
                    strokeWidth="10"
                    fill="none"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r={R_GAUGE}
                    stroke="#c6ff3a"
                    strokeWidth="10"
                    fill="none"
                    strokeDasharray={`${dashScore} ${C_GAUGE}`}
                    transform="rotate(-90 100 100)"
                    strokeLinecap="round"
                    style={{
                      transition:
                        "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)",
                    }}
                  />
                  {/* projected faint ring */}
                  <circle
                    cx="100"
                    cy="100"
                    r={R_GAUGE}
                    stroke="rgba(198,255,58,0.15)"
                    strokeWidth="10"
                    fill="none"
                    strokeDasharray={`${dashProjected} ${C_GAUGE}`}
                    transform="rotate(-90 100 100)"
                    strokeLinecap="round"
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 64,
                      fontWeight: 500,
                      letterSpacing: -3,
                      lineHeight: 1,
                      color: "#fafaf6",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {data.fit.score}
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: "#8a8a85",
                      marginTop: 4,
                      letterSpacing: 0.5,
                    }}
                  >
                    / 100
                  </span>
                </div>
              </div>

              {/* Delta */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  paddingTop: 12,
                  borderTop: "1px solid rgba(250,250,246,0.1)",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 500,
                    color: "#c6ff3a",
                    letterSpacing: -0.8,
                  }}
                >
                  +{scoreMaxPossivel - data.fit.score} pts
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#8a8a85",
                    letterSpacing: 0.3,
                  }}
                >
                  disponíveis com ajustes
                </span>
              </div>

              {/* vs media */}
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background:
                    delta < 0 ? "rgba(239,68,68,0.15)" : "rgba(198,255,58,0.1)",
                  borderRadius: 10,
                  padding: "8px 14px",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: delta < 0 ? "#f87171" : "#c6ff3a",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {delta < 0 ? "" : "+"}
                  {delta} pts
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color:
                      delta < 0
                        ? "rgba(248,113,113,0.7)"
                        : "rgba(198,255,58,0.7)",
                  }}
                >
                  vs média da vaga ({mediaScore})
                </span>
              </div>
            </div>
          </div>

          {/* ── Alerta de competição / Early bird ── */}
          {jobAnalysisCount === null || jobAnalysisCount < 15 ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                background: "rgba(198,255,58,0.1)",
                border: "1px solid rgba(198,255,58,0.35)",
                borderRadius: 14,
                padding: "14px 18px",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 18, marginTop: 1, flexShrink: 0 }}>
                🚀
              </span>
              <div>
                <p
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: "#2a3a08",
                    margin: "0 0 3px",
                  }}
                >
                  Você é uma das primeiras pessoas a analisar essa vaga
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "#405410",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Não perca tempo — baixe seu CV ideal e se candidate antes que
                  a concorrência chegue.{" "}
                  <strong>
                    Candidatos que aplicam cedo têm mais visibilidade com
                    recrutadores.
                  </strong>
                </p>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                background: "#fffbeb",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 14,
                padding: "14px 18px",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 18, marginTop: 1, flexShrink: 0 }}>
                ⚠️
              </span>
              <div>
                <p
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: "#92400e",
                    margin: "0 0 3px",
                  }}
                >
                  {jobAnalysisCount} candidatos já analisaram esta vaga
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "#78350f",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Vagas como essa recebem centenas de candidaturas. Recrutadores
                  priorizam os CVs com maior compatibilidade — e você está{" "}
                  {Math.abs(delta)} pts {delta < 0 ? "abaixo" : "acima"} da
                  média agora.{" "}
                  <strong>
                    Seu CV otimizado já está pronto. Cada hora conta.
                  </strong>
                </p>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              SEÇÃO 1 — Experiência Profissional
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="SEÇÃO 1 — EXPERIÊNCIA PROFISSIONAL"
            title="O que já está a seu favor"
            description="Pontos do seu perfil que contribuem positivamente para esta vaga."
            score={data.secoes.experiencia.score}
            maxScore={data.secoes.experiencia.max}
          />

          {/* Pontos fortes */}
          <div style={{ ...CARD, marginBottom: 10 }}>
            {/* Card header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
                paddingBottom: 14,
                borderBottom: "1px solid rgba(10,10,10,0.06)",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(198,255,58,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 14, color: "#405410" }}>✓</span>
              </div>
              <div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    margin: 0,
                  }}
                >
                  Pontos fortes identificados
                </p>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "#8a8a85",
                    margin: "2px 0 0",
                  }}
                >
                  contribuem positivamente para o score
                </p>
              </div>
              <span
                style={{
                  marginLeft: "auto",
                  background: "rgba(198,255,58,0.2)",
                  color: "#405410",
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 8px",
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              >
                +{ptsPositivos} pts
              </span>
            </div>

            {/* Items */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(isGuestView
                ? data.positivos.slice(0, GUEST_VISIBLE)
                : data.positivos
              ).map((item, i) => (
                <div
                  key={item.texto}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr auto",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#8a8a85",
                      paddingTop: 2,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 13.5,
                        color: "#2a2a28",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      {item.texto}
                    </p>
                    <div
                      style={{
                        marginTop: 6,
                        height: 3,
                        background: "rgba(10,10,10,0.06)",
                        borderRadius: 99,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          background: "#c6ff3a",
                          borderRadius: 99,
                          width: `${Math.round((item.pontos / Math.max(...data.positivos.map((p) => p.pontos), 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      background: "rgba(198,255,58,0.2)",
                      color: "#405410",
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "2px 6px",
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    +{item.pontos}
                  </span>
                </div>
              ))}
            </div>

            {isGuestView && data.positivos.length > GUEST_VISIBLE && (
              <GuestBlurOverlay
                count={Math.min(
                  data.positivos.length - GUEST_VISIBLE,
                  GUEST_MOCK_POSITIVOS.length,
                )}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {GUEST_MOCK_POSITIVOS.slice(
                    0,
                    Math.min(
                      data.positivos.length - GUEST_VISIBLE,
                      GUEST_MOCK_POSITIVOS.length,
                    ),
                  ).map((item, i) => (
                    <div
                      key={item.texto}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 1fr auto",
                        gap: 12,
                        alignItems: "start",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 500,
                          color: "#8a8a85",
                          paddingTop: 2,
                        }}
                      >
                        {String(GUEST_VISIBLE + i + 1).padStart(2, "0")}
                      </div>
                      <p
                        style={{
                          fontSize: 13.5,
                          color: "#2a2a28",
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        {item.texto}
                      </p>
                      <span
                        style={{
                          background: "rgba(198,255,58,0.2)",
                          color: "#405410",
                          fontFamily: MONO,
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          whiteSpace: "nowrap",
                        }}
                      >
                        +{item.pontos}
                      </span>
                    </div>
                  ))}
                </div>
              </GuestBlurOverlay>
            )}
          </div>

          {/* Ajustes de conteúdo */}
          <div style={{ ...CARD, marginBottom: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
                paddingBottom: 14,
                borderBottom: "1px solid rgba(10,10,10,0.06)",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(245,158,11,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 14 }}>🎯</span>
              </div>
              <div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    margin: 0,
                  }}
                >
                  Ajustes de conteúdo
                </p>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "#8a8a85",
                    margin: "2px 0 0",
                  }}
                >
                  lacunas que o EarlyCV corrige no CV otimizado
                </p>
              </div>
              <span
                style={{
                  marginLeft: "auto",
                  background: "rgba(245,158,11,0.12)",
                  color: "#92400e",
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 8px",
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              >
                +{totalAjustesConteudo} pts
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(isGuestView
                ? data.ajustes_conteudo.slice(0, GUEST_VISIBLE)
                : data.ajustes_conteudo
              ).map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    background: "#fff",
                    border: "1px solid rgba(10,10,10,0.06)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    display: "grid",
                    gridTemplateColumns: "28px 1fr auto",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#8a8a85",
                      paddingTop: 2,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        letterSpacing: -0.2,
                        color: "#0a0a0a",
                        margin: "0 0 4px",
                      }}
                    >
                      {a.titulo}
                    </p>
                    {a.descricao && (
                      <p
                        style={{
                          fontSize: 12.5,
                          color: "#5a5a55",
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        {a.descricao}
                      </p>
                    )}
                    {a.dica && (
                      <p
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#8a8a85",
                          marginTop: 6,
                          fontStyle: "italic",
                        }}
                      >
                        {a.dica}
                      </p>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9.5,
                      fontWeight: 500,
                      letterSpacing: 1,
                      padding: "3px 7px",
                      borderRadius: 4,
                      background: "#0a0a0a",
                      color: "#fff",
                      marginTop: 2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    +{a.pontos} pts
                  </span>
                </div>
              ))}
            </div>

            {isGuestView && data.ajustes_conteudo.length > GUEST_VISIBLE && (
              <GuestBlurOverlay
                count={Math.min(
                  data.ajustes_conteudo.length - GUEST_VISIBLE,
                  GUEST_MOCK_AJUSTES.length,
                )}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {GUEST_MOCK_AJUSTES.slice(
                    0,
                    Math.min(
                      data.ajustes_conteudo.length - GUEST_VISIBLE,
                      GUEST_MOCK_AJUSTES.length,
                    ),
                  ).map((a, i) => (
                    <div
                      key={a.id}
                      style={{
                        background: "#fff",
                        border: "1px solid rgba(10,10,10,0.06)",
                        borderRadius: 12,
                        padding: "14px 16px",
                        display: "grid",
                        gridTemplateColumns: "28px 1fr auto",
                        gap: 12,
                        alignItems: "start",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 500,
                          color: "#8a8a85",
                          paddingTop: 2,
                        }}
                      >
                        {String(GUEST_VISIBLE + i + 1).padStart(2, "0")}
                      </div>
                      <div>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: "#0a0a0a",
                            margin: "0 0 4px",
                          }}
                        >
                          {a.titulo}
                        </p>
                        <p
                          style={{
                            fontSize: 12.5,
                            color: "#5a5a55",
                            lineHeight: 1.5,
                            margin: 0,
                          }}
                        >
                          {a.descricao}
                        </p>
                      </div>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 9.5,
                          fontWeight: 500,
                          padding: "3px 7px",
                          borderRadius: 4,
                          background: "#0a0a0a",
                          color: "#fff",
                          marginTop: 2,
                        }}
                      >
                        +{a.pontos} pts
                      </span>
                    </div>
                  ))}
                </div>
              </GuestBlurOverlay>
            )}

            <div
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.15)",
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              <span style={{ fontSize: 13, flexShrink: 0 }}>🔒</span>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#92400e",
                  margin: 0,
                }}
              >
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
            label="SEÇÃO 2 — COMPETÊNCIAS TÉCNICAS"
            title="Palavras-chave da vaga"
            description="Termos que o ATS desta vaga busca no seu CV — presentes e ausentes."
            score={data.secoes.competencias.score}
            maxScore={data.secoes.competencias.max}
          />

          {/* Keywords banner */}
          <div
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 14,
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 10,
            }}
          >
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 500, margin: "0 0 3px" }}>
                {data.keywords.presentes.length + data.keywords.ausentes.length}{" "}
                keywords identificadas para esta vaga
              </p>
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                  margin: 0,
                }}
              >
                Libere o CV para inserir as{" "}
                <span style={{ color: "#c6ff3a", fontWeight: 600 }}>
                  {data.keywords.ausentes.length} que faltam
                </span>{" "}
                e ganhar até{" "}
                <span style={{ color: "#c6ff3a", fontWeight: 600 }}>
                  +{totalKwAusentes} pts
                </span>
              </p>
            </div>
            <div
              style={{
                background: "rgba(198,255,58,0.12)",
                borderRadius: 12,
                padding: "10px 16px",
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 22,
                  fontWeight: 500,
                  color: "#c6ff3a",
                  letterSpacing: -0.8,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                +{totalKwAusentes}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: "rgba(198,255,58,0.6)",
                }}
              >
                pts em jogo
              </span>
            </div>
          </div>

          {/* Keywords card */}
          <div style={{ ...CARD, marginBottom: 0 }}>
            {/* Presentes */}
            <p
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.2,
                color: "#405410",
                fontWeight: 500,
                marginBottom: 10,
              }}
            >
              JÁ NO SEU CV ({data.keywords.presentes.length})
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 7,
                marginBottom: 20,
              }}
            >
              {(isGuestView
                ? data.keywords.presentes.slice(0, GUEST_VISIBLE)
                : data.keywords.presentes
              ).map((k) => (
                <span
                  key={k.kw}
                  style={{
                    background: "rgba(198,255,58,0.2)",
                    border: "1px solid rgba(110,150,20,0.2)",
                    color: "#405410",
                    fontFamily: MONO,
                    fontSize: 11.5,
                    fontWeight: 500,
                    padding: "5px 11px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  ✓ {k.kw}
                  <span style={{ fontSize: 10, opacity: 0.6 }}>
                    +{k.pontos}
                  </span>
                </span>
              ))}
            </div>
            {isGuestView && data.keywords.presentes.length > GUEST_VISIBLE && (
              <GuestBlurOverlay
                count={Math.min(
                  data.keywords.presentes.length - GUEST_VISIBLE,
                  GUEST_MOCK_KW.length,
                )}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 7,
                    marginBottom: 20,
                  }}
                >
                  {GUEST_MOCK_KW.slice(
                    0,
                    Math.min(
                      data.keywords.presentes.length - GUEST_VISIBLE,
                      GUEST_MOCK_KW.length,
                    ),
                  ).map((k) => (
                    <span
                      key={k.kw}
                      style={{
                        background: "rgba(198,255,58,0.2)",
                        border: "1px solid rgba(110,150,20,0.2)",
                        color: "#405410",
                        fontFamily: MONO,
                        fontSize: 11.5,
                        fontWeight: 500,
                        padding: "5px 11px",
                        borderRadius: 999,
                      }}
                    >
                      ✓ {k.kw}
                    </span>
                  ))}
                </div>
              </GuestBlurOverlay>
            )}

            {/* Divisor */}
            <div
              style={{
                borderTop: "1px solid rgba(10,10,10,0.06)",
                marginBottom: 14,
              }}
            />

            {/* Faltando */}
            <p
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.2,
                color: "#92400e",
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              FALTANDO NO SEU CV ({data.keywords.ausentes.length})
            </p>
            <p style={{ fontSize: 12.5, color: "#8a8a85", marginBottom: 12 }}>
              Selecione quais você deseja incluir. Seu CV otimizado só
              adicionará as que você aprovar.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(isGuestView
                ? data.keywords.ausentes.slice(0, GUEST_VISIBLE)
                : data.keywords.ausentes
              ).map((k) => {
                const sel = selecionadas.has(k.kw);
                return (
                  <label
                    key={k.kw}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: sel
                        ? "rgba(198,255,58,0.08)"
                        : "rgba(245,158,11,0.06)",
                      border: `1px solid ${sel ? "rgba(110,150,20,0.25)" : "rgba(245,158,11,0.2)"}`,
                      borderRadius: 10,
                      padding: "11px 14px",
                      cursor: locked ? "default" : "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        border: `2px solid ${sel ? "#c6ff3a" : "rgba(245,158,11,0.4)"}`,
                        background: sel ? "#c6ff3a" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 150ms",
                      }}
                    >
                      {sel && (
                        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative
                        <svg
                          width="9"
                          height="7"
                          viewBox="0 0 10 8"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M1 4l3 3 5-6"
                            stroke="#0a0a0a"
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
                      style={{
                        flex: 1,
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: sel ? "#2a3a08" : "#92400e",
                      }}
                    >
                      {k.kw}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: sel
                          ? "rgba(198,255,58,0.25)"
                          : "rgba(245,158,11,0.15)",
                        color: sel ? "#405410" : "#92400e",
                        flexShrink: 0,
                      }}
                    >
                      +{k.pontos} pts
                    </span>
                  </label>
                );
              })}
            </div>

            {isGuestView && data.keywords.ausentes.length > GUEST_VISIBLE && (
              <GuestBlurOverlay
                count={Math.min(
                  data.keywords.ausentes.length - GUEST_VISIBLE,
                  GUEST_MOCK_KW.length,
                )}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {GUEST_MOCK_KW.slice(
                    0,
                    Math.min(
                      data.keywords.ausentes.length - GUEST_VISIBLE,
                      GUEST_MOCK_KW.length,
                    ),
                  ).map((k) => (
                    <div
                      key={k.kw}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: "rgba(245,158,11,0.06)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        borderRadius: 10,
                        padding: "11px 14px",
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: "2px solid rgba(245,158,11,0.4)",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: "#92400e",
                        }}
                      >
                        {k.kw}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 4,
                          background: "rgba(245,158,11,0.15)",
                          color: "#92400e",
                        }}
                      >
                        +{k.pontos} pts
                      </span>
                    </div>
                  ))}
                </div>
              </GuestBlurOverlay>
            )}

            {selecionadas.size > 0 && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(198,255,58,0.1)",
                  border: "1px solid rgba(110,150,20,0.2)",
                  borderRadius: 10,
                  padding: "10px 14px",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#2a3a08",
                      margin: "0 0 2px",
                    }}
                  >
                    {selecionadas.size} palavra
                    {selecionadas.size > 1 ? "s" : ""}-chave selecionada
                    {selecionadas.size > 1 ? "s" : ""}
                  </p>
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#405410",
                      margin: 0,
                    }}
                  >
                    Serão incluídas no CV otimizado ao liberar
                  </p>
                </div>
                <span
                  style={{
                    background: "rgba(198,255,58,0.3)",
                    color: "#2a3a08",
                    fontFamily: MONO,
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "5px 12px",
                    borderRadius: 8,
                    flexShrink: 0,
                  }}
                >
                  +{ptsKwSelecionadas} pts
                </span>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 3 — Formatação e Campos
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="SEÇÃO 3 — FORMATAÇÃO E CAMPOS"
            title="Análise do formato do seu CV"
            description="Como os sistemas de triagem automática (ATS) leem e interpretam o seu arquivo."
            score={data.secoes.formatacao.score}
            maxScore={data.secoes.formatacao.max}
          />

          {data.formato_cv ? (
            <>
              {/* ATS compat summary */}
              <div style={{ ...CARD, marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    background:
                      data.secoes.formatacao.score >= 14
                        ? "rgba(198,255,58,0.1)"
                        : data.secoes.formatacao.score >= 8
                          ? "rgba(245,158,11,0.08)"
                          : "rgba(239,68,68,0.08)",
                    border: `1px solid ${data.secoes.formatacao.score >= 14 ? "rgba(110,150,20,0.2)" : data.secoes.formatacao.score >= 8 ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)"}`,
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}
                >
                  <IssueIcon
                    tipo={
                      data.secoes.formatacao.score >= 14
                        ? "ok"
                        : data.secoes.formatacao.score >= 8
                          ? "atencao"
                          : "critico"
                    }
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: "#0a0a0a",
                          margin: 0,
                        }}
                      >
                        Compatibilidade com ATS
                      </p>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 600,
                          color:
                            data.secoes.formatacao.score >= 14
                              ? "#405410"
                              : data.secoes.formatacao.score >= 8
                                ? "#92400e"
                                : "#991b1b",
                          flexShrink: 0,
                        }}
                      >
                        {data.secoes.formatacao.score}/20 pts
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "#5a5a55",
                        lineHeight: 1.5,
                        margin: "4px 0 0",
                      }}
                    >
                      {data.formato_cv.resumo}
                    </p>
                  </div>
                </div>
              </div>

              {/* Problemas */}
              <div style={{ ...CARD, marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#0a0a0a",
                      margin: 0,
                    }}
                  >
                    Problemas encontrados
                  </p>
                  {criticos.length > 0 && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 99,
                        background: "rgba(239,68,68,0.1)",
                        color: "#991b1b",
                      }}
                    >
                      {criticos.length} crítico{criticos.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {atencoes.length > 0 && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 99,
                        background: "rgba(245,158,11,0.12)",
                        color: "#92400e",
                      }}
                    >
                      {atencoes.length} atenção
                    </span>
                  )}
                  {oks.length > 0 && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 99,
                        background: "rgba(198,255,58,0.2)",
                        color: "#405410",
                      }}
                    >
                      {oks.length} ok
                    </span>
                  )}
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {data.formato_cv.problemas.length === 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "rgba(198,255,58,0.1)",
                        border: "1px solid rgba(110,150,20,0.15)",
                        borderRadius: 10,
                        padding: "12px 14px",
                      }}
                    >
                      <IssueIcon tipo="ok" />
                      <p
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: "#2a3a08",
                          margin: 0,
                        }}
                      >
                        Tudo ok — nenhum problema de formato encontrado
                      </p>
                    </div>
                  )}
                  {(isGuestView
                    ? data.formato_cv.problemas.slice(0, GUEST_VISIBLE)
                    : data.formato_cv.problemas
                  ).map((p) => (
                    <div
                      key={p.titulo}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        background:
                          p.tipo === "critico"
                            ? "rgba(239,68,68,0.05)"
                            : p.tipo === "atencao"
                              ? "rgba(245,158,11,0.05)"
                              : "rgba(198,255,58,0.05)",
                        border: `1px solid ${p.tipo === "critico" ? "rgba(239,68,68,0.15)" : p.tipo === "atencao" ? "rgba(245,158,11,0.15)" : "rgba(110,150,20,0.15)"}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                      }}
                    >
                      <IssueIcon tipo={p.tipo} />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <p
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: "#0a0a0a",
                              margin: 0,
                            }}
                          >
                            {p.titulo}
                          </p>
                          {p.impacto !== 0 && (
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                fontWeight: 600,
                                color: p.impacto > 0 ? "#405410" : "#991b1b",
                                flexShrink: 0,
                              }}
                            >
                              {p.impacto > 0 ? "+" : ""}
                              {p.impacto} pts
                            </span>
                          )}
                        </div>
                        <p
                          style={{
                            fontSize: 12.5,
                            color: "#5a5a55",
                            lineHeight: 1.5,
                            margin: "4px 0 0",
                          }}
                        >
                          {p.descricao}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isGuestView &&
                    data.formato_cv.problemas.length > GUEST_VISIBLE && (
                      <GuestBlurOverlay
                        count={Math.min(
                          data.formato_cv.problemas.length - GUEST_VISIBLE,
                          GUEST_MOCK_PROBLEMAS.length,
                        )}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          {GUEST_MOCK_PROBLEMAS.slice(
                            0,
                            Math.min(
                              data.formato_cv.problemas.length - GUEST_VISIBLE,
                              GUEST_MOCK_PROBLEMAS.length,
                            ),
                          ).map((p) => (
                            <div
                              key={p.titulo}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 12,
                                background:
                                  p.tipo === "critico"
                                    ? "rgba(239,68,68,0.05)"
                                    : "rgba(245,158,11,0.05)",
                                border: "1px solid rgba(10,10,10,0.06)",
                                borderRadius: 10,
                                padding: "12px 14px",
                              }}
                            >
                              <IssueIcon tipo={p.tipo} />
                              <div style={{ flex: 1 }}>
                                <p
                                  style={{
                                    fontSize: 13.5,
                                    fontWeight: 500,
                                    color: "#0a0a0a",
                                    margin: "0 0 4px",
                                  }}
                                >
                                  {p.titulo}
                                </p>
                                <p
                                  style={{
                                    fontSize: 12.5,
                                    color: "#5a5a55",
                                    lineHeight: 1.5,
                                    margin: 0,
                                  }}
                                >
                                  {p.descricao}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </GuestBlurOverlay>
                    )}
                </div>
              </div>

              {/* Campos */}
              <div style={{ ...CARD, marginBottom: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#0a0a0a",
                      margin: 0,
                    }}
                  >
                    Campos do currículo
                  </p>
                  {ptsFaltando > 0 ? (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        fontWeight: 600,
                        background: "rgba(239,68,68,0.1)",
                        color: "#991b1b",
                        padding: "3px 8px",
                        borderRadius: 6,
                      }}
                    >
                      -{ptsFaltando} pts
                    </span>
                  ) : (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: "#8a8a85",
                      }}
                    >
                      {camposPresentes}/{data.formato_cv.campos.length}{" "}
                      encontrados
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                  }}
                  className="res-campos-grid"
                >
                  {data.formato_cv.campos.map((campo) => {
                    const pts = CAMPO_PTS_MAP[campo.nome] ?? 1;
                    return (
                      <div
                        key={campo.nome}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: campo.presente
                            ? "rgba(198,255,58,0.1)"
                            : "rgba(239,68,68,0.05)",
                          border: `1px solid ${campo.presente ? "rgba(110,150,20,0.15)" : "rgba(239,68,68,0.12)"}`,
                          borderRadius: 8,
                          padding: "8px 11px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: campo.presente ? "#405410" : "#ef4444",
                            flexShrink: 0,
                          }}
                        >
                          {campo.presente ? "✓" : "✕"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: campo.presente ? "#2a2a28" : "#991b1b",
                          }}
                        >
                          {campo.nome}
                        </span>
                        {!campo.presente && (
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#ef4444",
                              flexShrink: 0,
                            }}
                          >
                            -{pts}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div style={{ ...CARD, textAlign: "center", padding: "32px 24px" }}>
              <p
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#2a2a28",
                  margin: "0 0 6px",
                }}
              >
                Análise de formato não incluída nesta análise
              </p>
              <p
                style={{
                  fontSize: 12.5,
                  color: "#8a8a85",
                  margin: "0 0 20px",
                  lineHeight: 1.5,
                }}
              >
                Refaça a análise para obter a avaliação completa de ATS e
                compatibilidade de formato.
              </p>
              <a
                href="/adaptar"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#0a0a0a",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Refazer análise
              </a>
            </div>
          )}

          {/* ── Preview ── */}
          {data.preview && (
            <>
              <SectionHeader
                label="PRÉVIA"
                title="Como seu CV ficará depois da otimização"
                description="Veja como o EarlyCV reescreve uma experiência para passar no ATS e chamar atenção do recrutador."
              />
              {/* Diff card with window chrome */}
              <div
                style={{
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 14,
                  overflow: "hidden",
                  boxShadow: "0 8px 30px -12px rgba(10,10,10,0.12)",
                }}
              >
                {/* Chrome */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "10px 14px",
                    background: "#f0efe9",
                    borderBottom: "1px solid rgba(10,10,10,0.06)",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: "50%",
                      background: "#ff5f57",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: "50%",
                      background: "#febc2e",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: "50%",
                      background: "#28c840",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      textAlign: "center",
                      fontFamily: MONO,
                      fontSize: 11,
                      color: "#7a7a74",
                      fontWeight: 500,
                      pointerEvents: "none",
                    }}
                  >
                    preview · {data.vaga.cargo}
                  </span>
                </div>
                {/* Diff body */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    background: "#fafaf6",
                  }}
                  className="res-diff-grid"
                >
                  {/* Antes */}
                  <div
                    style={{
                      padding: "18px 20px",
                      borderRight: "1px solid rgba(10,10,10,0.06)",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: 0.5,
                        background: "#fee2e2",
                        color: "#991b1b",
                        padding: "3px 7px",
                        borderRadius: 4,
                        marginBottom: 10,
                      }}
                    >
                      − antes
                    </span>
                    <p
                      style={{
                        fontSize: 13.5,
                        color: "#5a5a55",
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {data.preview.antes}
                    </p>
                  </div>
                  {/* Depois */}
                  <div style={{ padding: "18px 20px", position: "relative" }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: 0.5,
                        background: "rgba(198,255,58,0.3)",
                        color: "#405410",
                        border: "1px solid rgba(110,150,20,0.25)",
                        padding: "3px 7px",
                        borderRadius: 4,
                        marginBottom: 10,
                      }}
                    >
                      + depois (otimizado)
                    </span>
                    <p
                      style={{
                        fontSize: 13.5,
                        color: "#2a2a28",
                        lineHeight: 1.6,
                        margin: 0,
                        ...(isDemo
                          ? {}
                          : {
                              maskImage:
                                "linear-gradient(to bottom, black 55%, transparent 100%)",
                              WebkitMaskImage:
                                "linear-gradient(to bottom, black 55%, transparent 100%)",
                            }),
                      }}
                    >
                      {data.preview.depois}
                    </p>
                    {!isDemo && (
                      <div
                        style={{
                          position: "absolute",
                          inset: "auto 0 0 0",
                          paddingBottom: 18,
                          display: "flex",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            background: "#fff",
                            border: "1px solid rgba(10,10,10,0.1)",
                            borderRadius: 999,
                            padding: "6px 14px",
                            fontFamily: MONO,
                            fontSize: 10.5,
                            fontWeight: 500,
                            color: "#555",
                            boxShadow: "0 2px 8px rgba(10,10,10,0.08)",
                          }}
                        >
                          🔒 Disponível após liberar o CV
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── CTA ── */}
          <div
            style={{
              background: "#0a0a0a",
              borderRadius: 20,
              overflow: "hidden",
              marginTop: 32,
            }}
          >
            {/* Urgency bar */}
            {Math.max(0, scoreMinimo - data.fit.score) > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(220,38,38,0.85)",
                  padding: "12px 24px",
                }}
              >
                <span style={{ fontSize: 14 }}>⚡</span>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    margin: 0,
                  }}
                >
                  Você está a {Math.max(0, scoreMinimo - data.fit.score)} pts do
                  score mínimo recomendado para ser chamado para entrevista
                </p>
              </div>
            )}

            <div style={{ padding: "32px 36px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 0.8fr",
                  gap: 32,
                  alignItems: "start",
                }}
                className="res-cta-grid"
              >
                {/* Left */}
                <div>
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      color: "rgba(255,255,255,0.35)",
                      marginBottom: 10,
                    }}
                  >
                    {isDemo ? "ESTE É UM EXEMPLO" : "NÃO DEIXE PARA DEPOIS"}
                  </p>
                  <h2
                    style={{
                      fontSize: 26,
                      fontWeight: 500,
                      letterSpacing: -1,
                      color: "#fafaf6",
                      margin: "0 0 10px",
                      lineHeight: 1.2,
                    }}
                  >
                    {isDemo ? (
                      <>
                        Agora descubra o que{" "}
                        <em
                          style={{
                            fontFamily: SERIF_ITALIC,
                            fontStyle: "italic",
                            fontWeight: 400,
                            color: "#c6ff3a",
                          }}
                        >
                          seu
                        </em>{" "}
                        CV precisa ajustar.
                      </>
                    ) : isDownloadReady ? (
                      <>
                        Seu CV otimizado está
                        <br />
                        <em
                          style={{
                            fontFamily: SERIF_ITALIC,
                            fontStyle: "italic",
                            fontWeight: 400,
                          }}
                        >
                          liberado.
                        </em>{" "}
                        Candidate-se o mais rápido possível.
                      </>
                    ) : (
                      <>
                        Seu CV otimizado já está
                        <br />
                        <em
                          style={{
                            fontFamily: SERIF_ITALIC,
                            fontStyle: "italic",
                            fontWeight: 400,
                          }}
                        >
                          pronto para liberar.
                        </em>
                      </>
                    )}
                  </h2>
                  {isDownloadReady && adaptationNotes ? (
                    <div
                      style={{
                        borderLeft: "3px solid #c6ff3a",
                        paddingLeft: 14,
                        marginBottom: 20,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <p
                        style={{
                          fontFamily: MONO,
                          fontSize: 9.5,
                          letterSpacing: 1,
                          color: "#c6ff3a",
                          margin: 0,
                          textTransform: "uppercase",
                        }}
                      >
                        O que foi feito no seu CV
                      </p>
                      <p
                        style={{
                          fontSize: 13,
                          color: "rgba(255,255,255,0.7)",
                          lineHeight: 1.65,
                          margin: 0,
                        }}
                      >
                        {adaptationNotes}
                      </p>
                    </div>
                  ) : (
                    <p
                      style={{
                        fontSize: 13.5,
                        color: "rgba(255,255,255,0.55)",
                        lineHeight: 1.6,
                        margin: "0 0 20px",
                      }}
                    >
                      Enquanto você decide, outros candidatos já estão enviando
                      CVs otimizados para esta mesma vaga. Candidatos com score
                      acima de 80 têm{" "}
                      <span
                        style={{
                          color: "rgba(255,255,255,0.9)",
                          fontWeight: 500,
                        }}
                      >
                        3× mais chances de ser chamados para entrevista.
                      </span>
                    </p>
                  )}

                  {/* Score bar */}
                  <div
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 12,
                      padding: "14px 16px",
                      marginBottom: 20,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontFamily: MONO,
                        fontSize: 10.5,
                        marginBottom: 8,
                      }}
                    >
                      <span style={{ color: "rgba(255,255,255,0.35)" }}>
                        Score atual
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.35)" }}>
                        Meta recomendada
                      </span>
                    </div>
                    <div
                      style={{
                        position: "relative",
                        height: 10,
                        background: "rgba(255,255,255,0.08)",
                        borderRadius: 99,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: "0 auto 0 0",
                          width: `${data.fit.score}%`,
                          background:
                            data.fit.score >= 70
                              ? "#c6ff3a"
                              : data.fit.score >= 40
                                ? "#f59e0b"
                                : "#ef4444",
                          borderRadius: 99,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: `${scoreMinimo}%`,
                          width: 2,
                          background: "rgba(198,255,58,0.6)",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 6,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 18,
                          fontWeight: 500,
                          color: data.fit.score >= 70 ? "#c6ff3a" : "#f59e0b",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {data.fit.score}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          background: "rgba(198,255,58,0.15)",
                          color: "#c6ff3a",
                          padding: "2px 8px",
                          borderRadius: 5,
                        }}
                      >
                        meta: {scoreMinimo}
                      </span>
                    </div>
                  </div>

                  {/* Checklist */}
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {[
                      `${data.ajustes_conteudo.length} ajustes de conteúdo prontos para aplicar`,
                      `${selecionadas.size > 0 ? selecionadas.size : data.keywords.ausentes.length} palavras-chave da vaga inseridas no contexto certo`,
                      "Formato validado para sistemas ATS — sem colunas, sem tabelas",
                      "Download em PDF e DOCX prontos para enviar hoje",
                    ].map((item) => (
                      <li
                        key={item}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          fontSize: 13.5,
                          color: "rgba(255,255,255,0.7)",
                        }}
                      >
                        <span
                          style={{
                            color: "#c6ff3a",
                            fontSize: 12,
                            marginTop: 2,
                            flexShrink: 0,
                          }}
                        >
                          ✓
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Right */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {/* Score projection */}
                  <div
                    style={{
                      background: "rgba(198,255,58,0.08)",
                      border: "1px solid rgba(198,255,58,0.15)",
                      borderRadius: 14,
                      padding: "18px 20px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: 1.2,
                        color: "rgba(198,255,58,0.55)",
                        marginBottom: 6,
                      }}
                    >
                      SEU SCORE APÓS LIBERAR
                    </p>
                    <p
                      style={{
                        fontSize: 52,
                        fontWeight: 500,
                        letterSpacing: -2.5,
                        color: "#c6ff3a",
                        margin: "0 0 4px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {scoreProjetado}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: "rgba(255,255,255,0.3)",
                      }}
                    >
                      <span>{data.fit.score}</span>
                      <span>+{totalAjustesConteudo} ajustes</span>
                      {ptsKwSelecionadas > 0 && (
                        <span>+{ptsKwSelecionadas} palavras</span>
                      )}
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>
                        = {scoreProjetado}/100
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {isDownloadReady ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDownload("pdf")}
                        disabled={downloading !== null}
                        style={{
                          width: "100%",
                          background: "#fafaf6",
                          color: "#0a0a0a",
                          border: "none",
                          borderRadius: 12,
                          padding: "15px",
                          fontSize: 14.5,
                          fontWeight: 500,
                          cursor: "pointer",
                          fontFamily: GEIST,
                          transition: "opacity 150ms",
                          opacity: downloading !== null ? 0.6 : 1,
                        }}
                      >
                        {getDownloadCtaCopy("pdf", downloading)}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload("docx")}
                        disabled={downloading !== null}
                        style={{
                          width: "100%",
                          background: "#fafaf6",
                          color: "#0a0a0a",
                          border: "none",
                          borderRadius: 12,
                          padding: "15px",
                          fontSize: 14.5,
                          fontWeight: 500,
                          cursor: "pointer",
                          fontFamily: GEIST,
                          transition: "opacity 150ms",
                          opacity: downloading !== null ? 0.6 : 1,
                        }}
                      >
                        {getDownloadCtaCopy("docx", downloading)}
                      </button>
                    </>
                  ) : isAuthenticated === false ? (
                    isDemo ? (
                      <>
                        <a
                          href="/adaptar"
                          style={{
                            display: "block",
                            width: "100%",
                            background: "#c6ff3a",
                            color: "#0a0a0a",
                            borderRadius: 12,
                            padding: "15px",
                            fontSize: 14.5,
                            fontWeight: 600,
                            textDecoration: "none",
                            textAlign: "center",
                            fontFamily: GEIST,
                            boxSizing: "border-box",
                          }}
                        >
                          Fazer minha análise grátis agora →
                        </a>
                        <p
                          style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color: "rgba(255,255,255,0.25)",
                            textAlign: "center",
                            margin: 0,
                          }}
                        >
                          Este é um exemplo. Envie seu CV e veja o resultado
                          real.
                        </p>
                      </>
                    ) : (
                      <>
                        <a
                          href={`/entrar?next=${encodeURIComponent("/adaptar/resultado?autoSave=1")}`}
                          onClick={() => {
                            emitResultadoEvent("cta_signup_click", {
                              cta_location: "resultado_unlock",
                            });
                            try {
                              // biome-ignore lint/suspicious/noDocumentCookie: redirect hint cookie for OAuth
                              document.cookie = `post_auth_next=${encodeURIComponent("/adaptar/resultado?autoSave=1")}; path=/; max-age=300; samesite=lax`;
                            } catch {}
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            background: "#fafaf6",
                            color: "#0a0a0a",
                            borderRadius: 12,
                            padding: "15px",
                            fontSize: 14.5,
                            fontWeight: 500,
                            textDecoration: "none",
                            textAlign: "center",
                            fontFamily: GEIST,
                            boxSizing: "border-box",
                          }}
                        >
                          Criar conta e liberar minha análise grátis
                        </a>
                        <p
                          style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color: "rgba(255,255,255,0.25)",
                            textAlign: "center",
                            margin: 0,
                          }}
                        >
                          Leva menos de 1 minuto. Sem cartão.
                        </p>
                      </>
                    )
                  ) : isAuthenticated === null ? (
                    <div
                      style={{
                        height: 54,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.08)",
                        animation: "res-pulse-bg 1.5s ease infinite",
                      }}
                    />
                  ) : reviewAdaptationId &&
                    reviewPaymentStatus !== "completed" ? (
                    hasCredits === true ? (
                      <button
                        type="button"
                        onClick={handleRedeemReview}
                        disabled={claiming}
                        style={{
                          width: "100%",
                          background: "#fafaf6",
                          color: "#0a0a0a",
                          border: "none",
                          borderRadius: 12,
                          padding: "15px",
                          fontSize: 14.5,
                          fontWeight: 500,
                          cursor: claiming ? "default" : "pointer",
                          fontFamily: GEIST,
                          opacity: claiming ? 0.6 : 1,
                        }}
                      >
                        {claiming
                          ? "Liberando CV..."
                          : "Liberar CV com 1 crédito"}
                      </button>
                    ) : (
                      <a
                        href="/planos"
                        style={{
                          display: "block",
                          background: "#fafaf6",
                          color: "#0a0a0a",
                          borderRadius: 12,
                          padding: "15px",
                          fontSize: 14.5,
                          fontWeight: 500,
                          textDecoration: "none",
                          textAlign: "center",
                          fontFamily: GEIST,
                        }}
                      >
                        Comprar créditos
                      </a>
                    )
                  ) : hasCredits === false ? (
                    <a
                      href="/planos"
                      style={{
                        display: "block",
                        background: "#fafaf6",
                        color: "#0a0a0a",
                        borderRadius: 12,
                        padding: "15px",
                        fontSize: 14.5,
                        fontWeight: 500,
                        textDecoration: "none",
                        textAlign: "center",
                        fontFamily: GEIST,
                      }}
                    >
                      Ver pacotes para liberar seu CV adaptado
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUseCredit}
                      disabled={hasCredits !== true || claiming}
                      style={{
                        width: "100%",
                        background: "#fafaf6",
                        color: "#0a0a0a",
                        border: "none",
                        borderRadius: 12,
                        padding: "15px",
                        fontSize: 14.5,
                        fontWeight: 500,
                        cursor:
                          hasCredits !== true || claiming
                            ? "default"
                            : "pointer",
                        fontFamily: GEIST,
                        opacity: hasCredits !== true || claiming ? 0.6 : 1,
                      }}
                    >
                      {claiming
                        ? "Liberando CV..."
                        : "Liberar meu CV otimizado agora →"}
                    </button>
                  )}

                  {!isDownloadReady && isAuthenticated !== false && (
                    <button
                      type="button"
                      onClick={() => window.location.assign("/planos")}
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.6)",
                        border: "none",
                        borderRadius: 12,
                        padding: "12px",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: GEIST,
                      }}
                    >
                      Ver pacotes de créditos
                    </button>
                  )}

                  <p
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 10,
                      padding: "10px 14px",
                      textAlign: "center",
                      fontSize: 13,
                      color: "rgba(255,255,255,0.6)",
                      margin: 0,
                    }}
                  >
                    Após liberar, os{" "}
                    <span style={{ color: "#c6ff3a" }}>
                      {totalAjustes} ajustes
                    </span>{" "}
                    são aplicados automaticamente.
                  </p>

                  {claimError && (
                    <p
                      style={{
                        fontFamily: MONO,
                        fontSize: 11.5,
                        color: "#f87171",
                        textAlign: "center",
                        margin: 0,
                      }}
                    >
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
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(10,10,10,0.35)",
              padding: "0 16px",
              transition: "opacity 260ms ease-out",
              opacity: releasePopupVisible ? 1 : 0,
            }}
          >
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={handleCloseReleasePopup}
              style={{
                position: "absolute",
                inset: 0,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            />
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 520,
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 20,
                padding: "24px",
                boxShadow: "0 24px 60px -20px rgba(10,10,10,0.35)",
                transition: "all 260ms ease-out",
                opacity: releasePopupVisible ? 1 : 0,
                transform: releasePopupVisible
                  ? "translateY(0) scale(1)"
                  : "translateY(8px) scale(0.98)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 17,
                      fontWeight: 500,
                      color: "#0a0a0a",
                      margin: "0 0 4px",
                    }}
                  >
                    CV liberado para download
                  </p>
                  <p style={{ fontSize: 13.5, color: "#6a6560", margin: 0 }}>
                    Seu CV final já está pronto. Escolha o formato para baixar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseReleasePopup}
                  style={{
                    background: "rgba(10,10,10,0.05)",
                    border: "none",
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: "#6a6560",
                  }}
                  aria-label="Fechar aviso"
                >
                  {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                  <svg
                    aria-hidden
                    width="14"
                    height="14"
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => handleDownload("pdf")}
                  disabled={downloading !== null || !reviewAdaptationId}
                  style={{
                    background: "#fafaf6",
                    border: "1px solid rgba(10,10,10,0.08)",
                    borderRadius: 12,
                    padding: "13px",
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: downloading !== null ? "default" : "pointer",
                    color: "#0a0a0a",
                    fontFamily: GEIST,
                    opacity:
                      downloading !== null || !reviewAdaptationId ? 0.6 : 1,
                  }}
                >
                  {getDownloadCtaCopy("pdf", downloading)}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload("docx")}
                  disabled={downloading !== null || !reviewAdaptationId}
                  style={{
                    background: "#fafaf6",
                    border: "1px solid rgba(10,10,10,0.08)",
                    borderRadius: 12,
                    padding: "13px",
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: downloading !== null ? "default" : "pointer",
                    color: "#0a0a0a",
                    fontFamily: GEIST,
                    opacity:
                      downloading !== null || !reviewAdaptationId ? 0.6 : 1,
                  }}
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

      <style>{`
        @keyframes res-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.9); } }
        @keyframes res-spin { to { transform: rotate(360deg); } }
        @keyframes res-pulse-bg { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
        @media (max-width: 860px) {
          .res-hero { grid-template-columns: 1fr !important; }
          .res-cta-grid { grid-template-columns: 1fr !important; }
          .res-diff-grid { grid-template-columns: 1fr !important; }
          .res-campos-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 540px) {
          .res-campos-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </PageShell>
  );
}
