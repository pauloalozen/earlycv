"use client";

import { useRouter } from "next/navigation";
import React, { type ReactNode, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import {
  CvReleaseModal,
  type CvReleaseModalStatus,
} from "@/components/cv-release-modal";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { PageShell } from "@/components/page-shell";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";
import { saveGuestPreview } from "@/lib/cv-adaptation-api";
import { getDownloadCtaCopy } from "@/lib/download-cta-copy";
import {
  clearGuestAnalysisRaw,
  getGuestAnalysisRaw,
} from "@/lib/guest-analysis-storage";
import { getAuthStatus } from "@/lib/session-actions";
import { getAtsScoreColors } from "./ats-score-colors";
import { buildContentFetchErrorMessage } from "./content-fetch-error";
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

const GUEST_VISIBLE = 1;

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
const RELEASE_MIN_LOADING_MS = 3000;

type GuestAnalysisStored = {
  adaptedContentJson: CvAnalysisData;
  previewText?: string;
  jobDescriptionText?: string;
  masterCvText?: string;
  analysisCvSnapshotId?: string;
  guestSessionPublicToken?: string | null;
};

type UnlockedOutputSectionItem = {
  heading?: string;
  bullets?: string[];
};

type UnlockedOutputSection = {
  sectionType?: string;
  title?: string;
  items?: UnlockedOutputSectionItem[];
};

type FinalCvOutput = {
  summary?: string;
  sections?: UnlockedOutputSection[];
};

function extractProfessionalSummaryFromFinalOutput(output: FinalCvOutput | null): string {
  if (!output) return "";
  const maybeOutput = output as {
    sections?: UnlockedOutputSection[];
    summary?: string;
  };

  const sections = Array.isArray(maybeOutput.sections) ? maybeOutput.sections : [];
  const summarySection = sections.find((section) => {
    const title = (section.title ?? "").toLowerCase();
    const type = (section.sectionType ?? "").toLowerCase();
    return (
      type === "summary" ||
      title.includes("resumo profissional") ||
      title === "resumo"
    );
  });

  if (summarySection) {
    const bullets = (summarySection.items ?? []).flatMap((item) =>
      Array.isArray(item.bullets) ? item.bullets : [],
    );
    const text = bullets
      .map((bullet) => (typeof bullet === "string" ? bullet.trim() : ""))
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  if (typeof maybeOutput.summary === "string") {
    return maybeOutput.summary.trim();
  }

  return "";
}

function hasFinalGeneratedCv(output: FinalCvOutput | null): boolean {
  if (!output) return false;
  const sections = (output as { sections?: Array<{ sectionType?: string }> }).sections ?? [];
  return sections.some((s) => s.sectionType && s.sectionType !== "other");
}

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
    const stored = getGuestAnalysisRaw();
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
  const [autoSaveRetryTick, setAutoSaveRetryTick] = useState(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const autoSaveAttempted = useRef(false);
  const autoSaveInFlight = useRef(false);
  const autoSaveRetryCount = useRef(0);
  const autoSaveStatusTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsDemo(params.get("demo") === "1");
    setAutoSave(params.get("autoSave") === "1");
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [internalRole, setInternalRole] = useState<
    "none" | "admin" | "superadmin" | null
  >(null);
  const [hasCredits, setHasCredits] = useState<boolean | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [availableCreditsDisplay, setAvailableCreditsDisplay] = useState<
    number | "∞" | "—" | undefined
  >(undefined);
  const [reviewAdaptationId, setReviewAdaptationId] = useState<string | null>(
    null,
  );
  const [reviewPaymentStatus, setReviewPaymentStatus] = useState<
    "none" | "pending" | "completed" | "failed" | "refunded" | null
  >(null);

  const [jobAnalysisCount, setJobAnalysisCount] = useState<number | null>(null);
  const [finalCvOutput, setFinalCvOutput] = useState<FinalCvOutput | null>(null);

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseModalVisible, setReleaseModalVisible] = useState(false);
  const [releaseStatus, setReleaseStatus] =
    useState<CvReleaseModalStatus>("loading");
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const closeReleaseModalTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    if (releaseModalOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isClient, releaseModalOpen]);

  useEffect(() => {
    return () => {
      if (closeReleaseModalTimeoutRef.current !== null) {
        window.clearTimeout(closeReleaseModalTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoSaveStatusTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveStatusTimeoutRef.current);
      autoSaveStatusTimeoutRef.current = null;
    }

    if (autoSaveStatus === "saved") {
      autoSaveStatusTimeoutRef.current = window.setTimeout(() => {
        setAutoSaveStatus("idle");
      }, 3200);
    }

    return () => {
      if (autoSaveStatusTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveStatusTimeoutRef.current);
        autoSaveStatusTimeoutRef.current = null;
      }
    };
  }, [autoSaveStatus]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const params = new URLSearchParams(window.location.search);
    const adaptationId = params.get("adaptationId");

    getAuthStatus().then(
      ({
        isAuthenticated: auth,
        userName: name,
        hasCredits,
        internalRole,
        availableCreditsDisplay,
      }) => {
        if (!active) return;
        setIsAuthenticated(auth);
        setUserName(name);
        setHasCredits(hasCredits);
        setInternalRole(internalRole);
        setAvailableCreditsDisplay(availableCreditsDisplay);
      },
    );

    if (adaptationId) {
      setReviewAdaptationId(adaptationId);
      fetch(`/api/cv-adaptation/${adaptationId}/content`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const responseText = await res.text();
            throw new Error(
              buildContentFetchErrorMessage(res.status, responseText),
            );
          }
          return res.json() as Promise<{
            adaptedContentJson: CvAnalysisData;
            finalCvOutput?: FinalCvOutput | null;
            paymentStatus:
              | "none"
              | "pending"
              | "completed"
              | "failed"
              | "refunded";
            isUnlocked?: boolean;
            jobAnalysisCount?: number;
            adaptationNotes?: string | null;
          }>;
        })
        .then((payload) => {
          if (!active) return;
          setRawData(payload.adaptedContentJson);
          setFinalCvOutput(payload.finalCvOutput ?? null);
          setReviewPaymentStatus(
            payload.isUnlocked ? "completed" : payload.paymentStatus,
          );
          setJobAnalysisCount(payload.jobAnalysisCount ?? null);
        })
        .catch((error: unknown) => {
          if (!active || controller.signal.aborted) return;

          const stored = getGuestAnalysisRaw();
          if (stored) {
            try {
              const parsed = JSON.parse(stored) as GuestAnalysisStored;
              if (parsed?.adaptedContentJson) {
                setRawData(parsed.adaptedContentJson);
                setClaimError(
                  "Não foi possível sincronizar esta análise com sua conta agora.",
                );
                return;
              }
            } catch {
              // ignore parse errors and fallback to route redirect below
            }
          }

          const message =
            error instanceof Error && error.message.trim()
              ? error.message
              : "Não foi possível carregar essa análise agora.";
          console.error(
            `[resultado] failed to load adaptation ${adaptationId}: ${message}`,
          );
          setClaimError(message);
          router.replace("/adaptar");
        });
      return () => {
        active = false;
        controller.abort();
      };
    }

    const stored = getGuestAnalysisRaw();
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
        { cache: "no-store", signal: controller.signal },
      )
        .then((r) => r.json() as Promise<{ count: number }>)
        .then((body) => {
          if (!active) return;
          setJobAnalysisCount(body.count);
        })
        .catch(() => {});
    } catch {
      clearGuestAnalysisRaw();
      router.replace("/adaptar");
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [router]);

  // ── Handlers ──────────────────────────────────────────────

  const toggleKw = (kw: string) => {
    if (
      locked ||
      isKeywordsFrozen ||
      (reviewAdaptationId !== null && reviewPaymentStatus === "completed")
    ) {
      return;
    }
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  };

  const waitForMinimumDuration = async (startedAt: number, minMs: number) => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < minMs) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, minMs - elapsed),
      );
    }
  };

  const handleUseCredit = async () => {
    if (!hasCredits || claiming) return;
    emitResultadoEvent("cv_unlock_started", {
      adaptationId: reviewAdaptationId,
      source_detail: "resultado",
      unlockMethod: "credit",
    });
    const startedAt = Date.now();
    setReleaseError(null);
    setReleaseStatus("loading");
    setReleaseModalOpen(true);
    requestAnimationFrame(() => setReleaseModalVisible(true));
    const raw = getGuestAnalysisRaw();
    if (!raw) {
      const message = "Análise não encontrada. Reanalise seu CV.";
      setClaimError(message);
      setReleaseError(message);
      setReleaseStatus("error");
      return;
    }
    let parsed: GuestAnalysisStored;
    try {
      parsed = JSON.parse(raw) as GuestAnalysisStored;
    } catch {
      const message =
        "Não foi possível carregar sua análise. Reanalise seu CV.";
      setClaimError(message);
      setReleaseError(message);
      setReleaseStatus("error");
      return;
    }
    if (!parsed.masterCvText?.trim()) {
      const message =
        "Análise em formato antigo. Reanalise seu CV para liberar o download.";
      setClaimError(message);
      setReleaseError(message);
      setReleaseStatus("error");
      return;
    }
    if (!parsed.analysisCvSnapshotId?.trim()) {
      const message =
        "Análise em formato antigo. Reanalise seu CV para liberar o download.";
      setClaimError(message);
      setReleaseError(message);
      setReleaseStatus("error");
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
          analysisCvSnapshotId: parsed.analysisCvSnapshotId,
          guestSessionPublicToken: parsed.guestSessionPublicToken ?? undefined,
          jobTitle: parsed.adaptedContentJson?.vaga?.cargo,
          companyName: parsed.adaptedContentJson?.vaga?.empresa,
          selectedMissingKeywords: Array.from(effectiveSelected),
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
        isUnlocked?: boolean;
      };
      if (payload.id) setReviewAdaptationId(payload.id);
      setReviewPaymentStatus(
        payload.isUnlocked
          ? "completed"
          : (payload.paymentStatus ?? "completed"),
      );
      setHasCredits(false);
      await waitForMinimumDuration(startedAt, RELEASE_MIN_LOADING_MS);
      setReleaseStatus("success");
      setClaiming(false);
      window.dispatchEvent(new Event("dashboard:credit-redeemed"));
      emitResultadoEvent("cv_unlock_completed", {
        adaptationId: payload.id ?? reviewAdaptationId,
        source_detail: "resultado",
        unlockMethod: "credit",
        remainingCredits: 0,
      });
      clearGuestAnalysisRaw();
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Não foi possível usar seu crédito agora. Tente novamente.";
      setClaimError(message);
      setReleaseError(message);
      setReleaseStatus("error");
      setClaiming(false);
      setLocked(false);
    }
  };

  // Vincular análise guest ao usuário autenticado imediatamente no resultado.
  // Não consome crédito, apenas persiste no histórico.
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

    const raw = getGuestAnalysisRaw();
    if (!raw) return;

    let parsed: GuestAnalysisStored;
    try {
      parsed = JSON.parse(raw) as GuestAnalysisStored;
    } catch {
      return;
    }
    if (!parsed.masterCvText?.trim() || !parsed.analysisCvSnapshotId?.trim()) {
      return;
    }

    const masterCvText = parsed.masterCvText;
    const analysisCvSnapshotId = parsed.analysisCvSnapshotId;

    if (autoSaveInFlight.current) return;
    autoSaveInFlight.current = true;
    setAutoSaveStatus("saving");

    const runPersist = async () => {
      try {
        const result = await saveGuestPreview({
          adaptedContentJson: parsed.adaptedContentJson as Record<
            string,
            unknown
          >,
          previewText: parsed.previewText,
          jobDescriptionText: parsed.jobDescriptionText ?? "",
          masterCvText,
          analysisCvSnapshotId,
          guestSessionPublicToken: parsed.guestSessionPublicToken ?? undefined,
          jobTitle: parsed.adaptedContentJson?.vaga?.cargo,
          companyName: parsed.adaptedContentJson?.vaga?.empresa,
        });

        autoSaveAttempted.current = true;
        autoSaveInFlight.current = false;
        setAutoSaveStatus("saved");
        setReviewAdaptationId(result.id);
        setReviewPaymentStatus(
          result.isUnlocked ? "completed" : (result.paymentStatus ?? "none"),
        );
        const normalized = normalizeData(parsed.adaptedContentJson);
        const score = normalized.score.scoreAtualBase;
        if (typeof score === "number") {
          const scoreProjetado = normalized.score.scoreAposLiberarBase;
          sessionStorage.setItem(
            "lastAnalysisScore",
            JSON.stringify({ score, scoreProjetado }),
          );
        }
        clearGuestAnalysisRaw();
        window.history.replaceState(
          null,
          "",
          `/adaptar/resultado?adaptationId=${result.id}`,
        );
      } catch {
        autoSaveInFlight.current = false;
        autoSaveRetryCount.current += 1;
        if (autoSaveRetryCount.current <= 3) {
          setAutoSaveStatus("saving");
          window.setTimeout(() => {
            autoSaveAttempted.current = false;
            setAutoSaveRetryTick((value) => value + 1);
          }, 1200);
        } else {
          setAutoSaveStatus("error");
        }
      }
    };

    void runPersist();
  }, [
    autoSave,
    isAuthenticated,
    rawData,
    reviewAdaptationId,
    autoSaveRetryTick,
  ]);

  const handleRedeemReview = async () => {
    if (!reviewAdaptationId || hasCredits !== true || claiming) return;
    emitResultadoEvent("cv_unlock_started", {
      adaptationId: reviewAdaptationId,
      source_detail: "resultado",
      unlockMethod: "review_redeem",
    });
    const startedAt = Date.now();
    setReleaseError(null);
    setReleaseStatus("loading");
    setReleaseModalOpen(true);
    requestAnimationFrame(() => setReleaseModalVisible(true));
    setLocked(true);
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch(
        `/api/cv-adaptation/${reviewAdaptationId}/redeem-credit`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedMissingKeywords: Array.from(effectiveSelected),
          }),
        },
      );
      if (!res.ok) {
        let message = "Não foi possível liberar o CV agora. Tente novamente.";
        try {
          const body = (await res.json()) as { message?: string };
          if (typeof body.message === "string" && body.message.trim()) {
            message = body.message;
          }
        } catch {
          // no-op
        }
        throw new Error(message);
      }
      setReviewPaymentStatus("completed");
      setHasCredits(false);
      await waitForMinimumDuration(startedAt, RELEASE_MIN_LOADING_MS);
      setReleaseStatus("success");
      setClaiming(false);
      window.dispatchEvent(new Event("dashboard:credit-redeemed"));
      emitResultadoEvent("cv_unlock_completed", {
        adaptationId: reviewAdaptationId,
        source_detail: "resultado",
        unlockMethod: "review_redeem",
        remainingCredits: 0,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Não foi possível liberar o CV agora. Tente novamente.";
      setClaimError(message);
      setReleaseError(message);
      setReleaseStatus("error");
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
    void trackEvent({
      eventName,
      eventVersion: 1,
      idempotencyKey: `${routeVisitId}:${eventName}`,
      properties: {
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
    emitResultadoEvent("optimized_cv_downloaded", { format });
    if (releaseModalOpen) {
      setReleaseModalVisible(false);
      if (closeReleaseModalTimeoutRef.current !== null) {
        window.clearTimeout(closeReleaseModalTimeoutRef.current);
      }
      closeReleaseModalTimeoutRef.current = window.setTimeout(() => {
        setReleaseModalOpen(false);
        closeReleaseModalTimeoutRef.current = null;
      }, RELEASE_POPUP_FADE_MS);
    }
    setDownloading(format);
    setClaimError(null);
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${reviewAdaptationId}/download?format=${format}`,
        fallbackFilename: `cv-adaptado.${format}`,
        onStageChange: setDownloadStage,
      });
      void fetch(`/api/cv-adaptation/${reviewAdaptationId}/content`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ finalCvOutput?: FinalCvOutput | null }>) : null))
        .then((payload) => {
          if (payload?.finalCvOutput) setFinalCvOutput(payload.finalCvOutput);
        })
        .catch(() => undefined);
    } catch {
      setClaimError(
        "Não foi possível baixar o arquivo agora. Tente novamente.",
      );
    } finally {
      setDownloading(null);
      setDownloadStage(null);
    }
  };

  const handleCloseReleaseModal = () => {
    setReleaseModalVisible(false);
    if (closeReleaseModalTimeoutRef.current !== null) {
      window.clearTimeout(closeReleaseModalTimeoutRef.current);
    }
    closeReleaseModalTimeoutRef.current = window.setTimeout(() => {
      setReleaseModalOpen(false);
      closeReleaseModalTimeoutRef.current = null;
    }, RELEASE_POPUP_FADE_MS);
  };

  const handleDownloadRawJson = () => {
    if (!rawData) return;
    try {
      const blob = new Blob([JSON.stringify(rawData, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `analise-ia-bruta-${reviewAdaptationId ?? "guest"}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch {
      setClaimError("Nao foi possivel baixar o JSON bruto agora.");
    }
  };

  // ── Loading ────────────────────────────────────────────────

  const isResultReady =
    rawData !== null && (isDemo || isAuthenticated !== null);

  if (!isResultReady) {
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
  const frozenKeywords = Array.isArray(
    (rawData as CvAnalysisData & { selectedMissingKeywords?: unknown })
      .selectedMissingKeywords,
  )
    ? ((rawData as CvAnalysisData & { selectedMissingKeywords: string[] })
        .selectedMissingKeywords ?? [])
    : [];
  const effectiveSelected =
    frozenKeywords.length > 0 ? new Set(frozenKeywords) : selecionadas;
  const isKeywordsFrozen = frozenKeywords.length > 0;
  const isGuestView = isAuthenticated !== true && !isDemo;
  const vagaSeed = `${data.vaga.cargo}::${data.vaga.empresa}`;
  const mediaScore = seededInt(vagaSeed, 78, 85);
  const scoreMinimo = 80;

  const delta = data.score.scoreAtualBase - mediaScore;
  const ptsKwSelecionadas = data.keywords.ausentes
    .filter((k) => effectiveSelected.has(k.kw))
    .reduce((s, k) => s + k.pontos, 0);
  const totalAjustesConteudo = data.ajustes_conteudo.reduce(
    (s, a) => s + a.pontos,
    0,
  );
  const _totalAjustes =
    data.ajustes_conteudo.length + data.keywords.ausentes.length;

  const scoreProjetado = Math.min(
    100,
    data.score.scoreAposLiberarBase + ptsKwSelecionadas,
  );
  const scoreMaxPossivel = data.score.scoreAposLiberarBase;

  const criticos =
    data.formato_cv?.problemas.filter((p) => p.tipo === "critico") ?? [];
  const atencoes =
    data.formato_cv?.problemas.filter((p) => p.tipo === "atencao") ?? [];
  const oks = data.formato_cv?.problemas.filter((p) => p.tipo === "ok") ?? [];
  const problemasPontuacao = [...criticos, ...atencoes];
  const totalAjustesAplicados =
    data.ajustes_conteudo.length +
    data.keywords.ausentes.length +
    problemasPontuacao.length;
  const pontosPerdidosApresentacao = problemasPontuacao.reduce(
    (total, problema) => total + Math.abs(problema.impacto),
    0,
  );
  const camposPresentes =
    data.formato_cv?.campos.filter((c) => c.presente).length ?? 0;
  const ptsFaltando =
    data.formato_cv?.campos
      .filter((c) => !c.presente)
      .reduce((s, c) => s + (CAMPO_PTS_MAP[c.nome] ?? 1), 0) ?? 0;

  const isDownloadReady =
    reviewAdaptationId !== null && reviewPaymentStatus === "completed";
  const isKeywordSelectionLocked =
    locked || isKeywordsFrozen || isDownloadReady;
  const unlockedProfessionalSummary =
    isDownloadReady
      ? extractProfessionalSummaryFromFinalOutput(finalCvOutput)
      : "";
  const previewAntesText = data.preview?.antes ?? "";
  const previewDepoisText = (isDownloadReady && hasFinalGeneratedCv(finalCvOutput))
    ? unlockedProfessionalSummary
    : data.preview?.depois ?? "";
  const hasPreviewSection = Boolean(data.preview) || Boolean(isDownloadReady);

  const adaptationNotes = rawData?.adaptation_notes ?? null;
  const isAdminView =
    isAuthenticated === true &&
    (internalRole === "admin" || internalRole === "superadmin");

  // Gauge constants
  const R_GAUGE = 78;
  const C_GAUGE = 2 * Math.PI * R_GAUGE;
  const dashScore = C_GAUGE * (data.score.scoreAtualBase / 100);
  const dashProjected = C_GAUGE * (scoreMaxPossivel / 100);
  const gaugeColors = getAtsScoreColors(data.score.scoreAtualBase);
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
        <AppHeader
          userName={userName}
          availableCredits={availableCreditsDisplay}
        />

        <div
          className="resultado-content"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 32px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Auto-save banner hidden for now; keep state machine active */}

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
                className="res-meta-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(10,10,10,0.08)",
                }}
              >
                {[
                  {
                    num: String(data.score.scoreAtualBase),
                    label: "score\natual",
                  },
                  {
                    num: `+${scoreMaxPossivel - data.score.scoreAtualBase}`,
                    label: "pts\ndisponíveis",
                  },
                  {
                    num: String(totalAjustesAplicados),
                    label: "ajustes\nidentificados",
                  },
                ].map((item, i) => (
                  <React.Fragment key={`${item.num}-${item.label}`}>
                    {i > 0 && (
                      <div
                        className="res-meta-divider"
                        style={{
                          width: 1,
                          height: 38,
                          background: "rgba(10,10,10,0.1)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div
                      className="res-meta-item"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span
                        className="res-meta-num"
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
              className="res-gauge-card"
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
                    background: gaugeColors.primary,
                    display: "inline-block",
                    animation: "res-pulse 1.4s infinite",
                  }}
                />
                ATS SCORE · ATUAL
              </div>

              {/* Gauge */}
              <div
                className="res-gauge-wrap"
                style={{
                  position: "relative",
                  width: 200,
                  height: 200,
                  marginBottom: 12,
                }}
              >
                {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 200 200"
                  aria-hidden
                  style={{ display: "block" }}
                >
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
                    stroke={gaugeColors.primary}
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
                    stroke={gaugeColors.projected}
                    strokeWidth="10"
                    fill="none"
                    strokeDasharray={`${dashProjected} ${C_GAUGE}`}
                    transform="rotate(-90 100 100)"
                    strokeLinecap="round"
                  />
                </svg>
                <div
                  className="res-preview-chrome"
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
                    className="res-gauge-value"
                    style={{
                      fontSize: 64,
                      fontWeight: 500,
                      letterSpacing: -3,
                      lineHeight: 1,
                      color: "#fafaf6",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {data.score.scoreAtualBase}
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
                className="res-gauge-delta"
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
                  +{scoreMaxPossivel - data.score.scoreAtualBase} pts
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
                className="res-gauge-vs"
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
                </span>
              </p>
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
                const sel = effectiveSelected.has(k.kw);
                return (
                  <label
                    key={k.kw}
                    title={
                      isKeywordSelectionLocked
                        ? "Seleção bloqueada: CV já liberado"
                        : undefined
                    }
                    aria-label={
                      isKeywordSelectionLocked
                        ? `Keyword ${k.kw} bloqueada: CV já liberado`
                        : undefined
                    }
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
                      cursor: isKeywordSelectionLocked ? "default" : "pointer",
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
                      disabled={isKeywordSelectionLocked}
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

            {effectiveSelected.size > 0 && (
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
                    {effectiveSelected.size} palavra
                    {effectiveSelected.size > 1 ? "s" : ""}-chave selecionada
                    {effectiveSelected.size > 1 ? "s" : ""}
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
                        Formatação e compatibilidade ATS
                      </p>
                    </div>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "#5a5a55",
                        lineHeight: 1.5,
                        margin: "4px 0 0",
                      }}
                    >
                      {ptsFaltando === 0
                        ? "Você tem todos os campos essenciais, mas perde pontos por estrutura e linguagem pouco orientadas à vaga."
                        : "Seu CV perde pontos por campos ausentes e problemas de estrutura."}
                    </p>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "#5a5a55",
                        lineHeight: 1.5,
                        margin: "6px 0 0",
                      }}
                    >
                      {problemasPontuacao.length === 0
                        ? "Nenhuma perda por problemas de apresentação."
                        : `Você perdeu ${pontosPerdidosApresentacao} pontos nesta seção por ${problemasPontuacao.length} ${problemasPontuacao.length === 1 ? "problema" : "problemas"} de apresentação.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Campos */}
              <div style={{ ...CARD, marginBottom: 10 }}>
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
                    const visualPenaltyPerMissingField = 1;
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
                            -{visualPenaltyPerMissingField}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: ptsFaltando === 0 ? "#405410" : "#991b1b",
                    margin: "10px 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  {ptsFaltando === 0
                    ? "Nenhuma penalidade por campos ausentes."
                    : "Campos ausentes dependem de informação real do usuário e não podem ser inventados pela IA."}
                </p>
                {ptsFaltando === 0 && (
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "#5a5a55",
                      margin: "6px 0 0",
                      lineHeight: 1.5,
                    }}
                  >
                    Campos completos evitam penalidades, mas a nota também
                    considera clareza, estrutura e aderência da linguagem.
                  </p>
                )}
              </div>

              {/* O que está correto */}
              <div style={{ ...CARD, marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
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
                    O que está correto
                  </p>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {oks.length === 0 && (
                    <span
                      style={{
                        fontSize: 12.5,
                        color: "#8a8a85",
                      }}
                    >
                      Nenhum item positivo de formatação identificado.
                    </span>
                  )}
                  {(isGuestView ? oks.slice(0, GUEST_VISIBLE) : oks).map(
                    (p) => (
                      <div
                        key={p.titulo}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          background: "rgba(198,255,58,0.07)",
                          border: "1px solid rgba(110,150,20,0.15)",
                          borderRadius: 10,
                          padding: "12px 14px",
                        }}
                      >
                        <IssueIcon tipo="ok" />
                        <div style={{ flex: 1 }}>
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
                    ),
                  )}
                </div>
              </div>

              {/* Problemas */}
              <div style={{ ...CARD, marginBottom: 0 }}>
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
                    Problemas que reduzem sua pontuação
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
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {[...criticos, ...atencoes].length === 0 && (
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
                    ? [...criticos, ...atencoes].slice(0, GUEST_VISIBLE)
                    : [...criticos, ...atencoes]
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
                                color:
                                  p.tipo === "atencao" ? "#92400e" : "#991b1b",
                                flexShrink: 0,
                              }}
                            >
                              -{Math.abs(p.impacto)} pts
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
                    [...criticos, ...atencoes].length > GUEST_VISIBLE && (
                      <GuestBlurOverlay
                        count={Math.min(
                          [...criticos, ...atencoes].length - GUEST_VISIBLE,
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
                              [...criticos, ...atencoes].length - GUEST_VISIBLE,
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
          {hasPreviewSection && (
            <>
              <SectionHeader
                label="PRÉVIA DA OTIMIZAÇÃO"
                title="Veja como seu currículo pode ficar mais aderente à vaga"
                description="Este é um exemplo gerado pela análise. Após liberar o CV, criamos a versão final pronta para download."
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
                    className="res-preview-title"
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
                    exemplo de ajuste · {data.vaga.cargo}
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
                      − texto atual
                    </span>
                    <p
                      style={{
                        fontSize: 13.5,
                        color: "#5a5a55",
                        lineHeight: 1.6,
                        margin: 0,
                        ...(!isDownloadReady
                          ? {
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }
                          : {}),
                      }}
                    >
                      {previewAntesText}
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
                      + sugestão de melhoria
                    </span>
                    <p
                      style={{
                        fontSize: 13.5,
                        color: "#5a5a55",
                        lineHeight: 1.6,
                        margin: 0,
                        ...(!isDownloadReady
                          ? {
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }
                          : {}),
                        ...(isDemo || isDownloadReady
                          ? {}
                          : {
                              maskImage:
                                "linear-gradient(to bottom, black 55%, transparent 100%)",
                              WebkitMaskImage:
                                "linear-gradient(to bottom, black 55%, transparent 100%)",
                            }),
                      }}
                    >
                      {previewDepoisText}
                    </p>
                    {!isDemo && !isDownloadReady && (
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
                          🔒 Versão final disponível após liberar o CV
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
            {Math.max(0, scoreMinimo - data.score.scoreAtualBase) > 0 && (
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
                  Você está a{" "}
                  {Math.max(0, scoreMinimo - data.score.scoreAtualBase)} pts do
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
                          width: `${data.score.scoreAtualBase}%`,
                          background: gaugeColors.primary,
                          boxShadow: `0 0 10px ${gaugeColors.projected}, 0 0 22px ${gaugeColors.projected}`,
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
                          color: gaugeColors.primary,
                          textShadow: `0 0 10px ${gaugeColors.projected}, 0 0 18px ${gaugeColors.projected}`,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {data.score.scoreAtualBase}
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
                      {
                        key: "content-adjustments",
                        text: `${data.ajustes_conteudo.length} ajustes de conteúdo prontos para aplicar`,
                        visible: true,
                      },
                      {
                        key: "selected-keywords",
                        text: `${effectiveSelected.size} palavra${effectiveSelected.size > 1 ? "s" : ""}-chave da vaga inserida${effectiveSelected.size > 1 ? "s" : ""} no contexto certo`,
                        visible: effectiveSelected.size > 0,
                      },
                      {
                        key: "ats-format",
                        text: "Formato validado para sistemas ATS — sem colunas, sem tabelas",
                        visible: true,
                      },
                      {
                        key: "ready-download",
                        text: "Download em PDF e DOCX prontos para enviar hoje",
                        visible: true,
                      },
                    ].map((item) => (
                      <li
                        key={item.key}
                        style={{
                          display: item.visible ? "flex" : "none",
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
                        {item.text}
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
                      <span>{data.score.scoreAtualBase}</span>
                      <span>
                        + {data.score.pontosDisponiveisBase} pts disponíveis
                      </span>
                      {ptsKwSelecionadas > 0 && (
                        <span>+ {ptsKwSelecionadas} pts keywords ausentes</span>
                      )}
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>
                        = {scoreProjetado}/100
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {isDownloadReady && !releaseModalOpen ? (
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
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        <svg
                          aria-hidden="true"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
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
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        <svg
                          aria-hidden="true"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {getDownloadCtaCopy("docx", downloading)}
                      </button>
                    </>
                  ) : releaseModalOpen ? (
                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        background: "#fafaf6",
                        color: "#0a0a0a",
                        border: "none",
                        borderRadius: 12,
                        padding: "15px",
                        fontSize: 14.5,
                        fontWeight: 500,
                        cursor: "default",
                        fontFamily: GEIST,
                        opacity: 0.6,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        className="hidden sm:inline-flex"
                        aria-hidden="true"
                      >
                        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect
                            x="3"
                            y="11"
                            width="18"
                            height="11"
                            rx="2"
                            ry="2"
                          />
                          <path d="M7 11V7a5 5 0 0 1 9.5-2.2" />
                        </svg>
                      </span>
                      Liberando CV...
                    </button>
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
                  ) : isDemo ? (
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
                        Analisar meu CV agora →
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
                        Este é um exemplo. Envie seu CV e veja o resultado real.
                      </p>
                    </>
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
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          className="hidden sm:inline-flex"
                          aria-hidden="true"
                        >
                          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect
                              x="3"
                              y="11"
                              width="18"
                              height="11"
                              rx="2"
                              ry="2"
                            />
                            <path d="M7 11V7a5 5 0 0 1 9.5-2.2" />
                          </svg>
                        </span>
                        {claiming
                          ? "Liberando CV..."
                          : "Liberar CV com 1 crédito"}
                      </button>
                    ) : (
                      <a
                        href={
                          reviewAdaptationId
                            ? `/planos?aid=${reviewAdaptationId}&source=resultado-buy-credits`
                            : "/planos"
                        }
                        onClick={() => {
                          emitResultadoEvent("buy_credits_clicked", {
                            adaptationId: reviewAdaptationId,
                            currentCredits: availableCreditsDisplay,
                            requiredCredits: 1,
                            cta_location: "resultado_locked_cv_primary",
                            source_detail: "resultado",
                          });
                        }}
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
                        Liberar meu CV agora.
                      </a>
                    )
                  ) : hasCredits === false ? (
                    <a
                      href={
                        reviewAdaptationId
                          ? `/planos?aid=${reviewAdaptationId}&source=resultado-buy-credits`
                          : "/planos"
                      }
                      onClick={() => {
                        emitResultadoEvent("buy_credits_clicked", {
                          adaptationId: reviewAdaptationId,
                          currentCredits: availableCreditsDisplay,
                          requiredCredits: 1,
                          cta_location: "resultado_buy_credits_card",
                          source_detail: "resultado",
                        });
                      }}
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
                    {isDownloadReady ? (
                      <>
                        Os <span style={{ color: "#c6ff3a" }}>ajustes</span> já
                        foram aplicados automaticamente.
                      </>
                    ) : (
                      <>
                        Após liberar, os{" "}
                        <span style={{ color: "#c6ff3a" }}>ajustes</span> são
                        aplicados automaticamente.
                      </>
                    )}
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

                  {isAdminView && (
                    <button
                      type="button"
                      onClick={handleDownloadRawJson}
                      style={{
                        width: "100%",
                        background: "transparent",
                        color: "rgba(255,255,255,0.75)",
                        border: "1px dashed rgba(255,255,255,0.35)",
                        borderRadius: 10,
                        padding: "10px 12px",
                        fontSize: 12,
                        fontFamily: MONO,
                        cursor: "pointer",
                      }}
                    >
                      Baixar JSON bruto da IA (admin)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <CvReleaseModal
        open={releaseModalOpen}
        visible={releaseModalVisible}
        status={releaseStatus}
        message={releaseError}
        canClose={releaseStatus !== "loading"}
        canDownload={Boolean(reviewAdaptationId) && releaseStatus === "success"}
        downloading={downloading}
        onDownloadPdf={() => handleDownload("pdf")}
        onDownloadDocx={() => handleDownload("docx")}
        onClose={handleCloseReleaseModal}
      />

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
        @media (max-width: 768px) {
          .resultado-content { padding: 12px 16px 60px !important; }
        }
        @media (max-width: 540px) {
          .res-meta-row { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; align-items: start !important; column-gap: 10px !important; row-gap: 8px !important; padding-top: 14px !important; }
          .res-meta-divider { display: none !important; }
          .res-meta-item { min-width: 0 !important; }
          .res-meta-num { font-size: 24px !important; }
          .res-gauge-card { padding: 18px 14px !important; border-radius: 16px !important; }
          .res-gauge-wrap { width: 150px !important; height: 150px !important; margin-bottom: 8px !important; }
          .res-gauge-wrap .res-preview-chrome { justify-content: center !important; flex-wrap: nowrap !important; row-gap: 0 !important; }
          .res-gauge-value { font-size: 40px !important; letter-spacing: -1.2px !important; }
          .res-gauge-delta { flex-wrap: wrap; row-gap: 4px; }
          .res-gauge-vs { flex-wrap: wrap; row-gap: 4px; }
          .res-campos-grid { grid-template-columns: 1fr !important; }
          .res-preview-chrome { justify-content: flex-start !important; flex-wrap: wrap !important; row-gap: 6px !important; }
          .res-preview-title { position: static !important; width: 100% !important; text-align: left !important; margin-top: 2px !important; display: block !important; }
        }
      `}</style>
    </PageShell>
  );
}
