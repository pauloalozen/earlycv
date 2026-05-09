"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  analyzeAuthenticatedCv,
  analyzeGuestCv,
  saveGuestPreview,
} from "@/lib/cv-adaptation-api";
import {
  appendTurnstileTokenToAnalyzeFormData,
  buildFunnelEventIdempotencyKey,
} from "@/lib/cv-adaptation-flow-helpers";
import { setGuestAnalysisRaw } from "@/lib/guest-analysis-storage";
import type { ResumeDto } from "@/lib/resumes-api";
import { getMyMasterResume } from "@/lib/resumes-api";
import { getAuthStatus } from "@/lib/session-actions";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const LOADING_STEPS = [
  "Lendo seu CV...",
  "Comparando com a vaga...",
  "Identificando gaps...",
  "Melhorando seu CV...",
];

const CV_INPUT_BOX_MIN_HEIGHT = 154;
const IS_TEST_ENV = process.env.NODE_ENV === "test";
const ANALYSIS_MIN_LOADING_MS = IS_TEST_ENV ? 0 : 10000;
const RESULT_TRANSITION_DELAY_MS = IS_TEST_ENV ? 0 : 2000;

const EXAMPLE_JOB = `Analista de Dados Sênior — Nubank

Somos um dos maiores bancos digitais do mundo e buscamos um Analista de Dados Sênior para integrar nosso time de Growth Analytics.

Responsabilidades:
• Construir e manter dashboards e relatórios em Looker/Tableau para times de produto e negócio
• Desenvolver modelos preditivos e análises exploratórias usando Python e SQL
• Colaborar com times de engenharia na definição de eventos de tracking e qualidade de dados
• Transformar dados brutos em insights acionáveis que guiem decisões estratégicas
• Mentorear analistas juniores e contribuir para a cultura data-driven da empresa

Requisitos:
• 4+ anos de experiência com análise de dados em ambiente de alta escala
• Domínio avançado de SQL e Python (pandas, scikit-learn)
• Experiência com ferramentas de BI (Looker, Tableau ou Power BI)
• Familiaridade com pipelines de dados (dbt, Airflow ou similares)
• Excelente comunicação para traduzir análises técnicas em linguagem de negócio

Diferenciais:
• Experiência em fintechs ou startups de crescimento acelerado
• Conhecimento de metodologias de experimentação (A/B testing)
• Background em estatística ou ciências de dados

Local: Remoto (Brasil) | Regime: CLT | Área: Dados & Analytics`;

type CvMode = "master" | "upload" | "text";

const ADAPT_FLOW_SESSION_ID_KEY = "adaptFlowSessionId";

function getTurnstileSiteKey() {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
}

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance?: "always" | "execute" | "interaction-only";
      execution?: "execute" | "render";
      size: "compact" | "flexible" | "normal";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ) => string;
  execute: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function buildClientAttemptId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readTurnstileTokenFromDom() {
  if (typeof document === "undefined") {
    return null;
  }

  const hiddenInput = document.querySelector<HTMLInputElement>(
    'input[name="cf-turnstile-response"]',
  );
  const token = hiddenInput?.value?.trim();

  return token ? token : null;
}

export default function AdaptarPage() {
  const turnstileSiteKey = getTurnstileSiteKey();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null | undefined>(
    undefined,
  );
  const [availableCredits, setAvailableCredits] = useState<
    number | "∞" | "—" | undefined
  >(undefined);
  const [masterResume, setMasterResume] = useState<
    ResumeDto | null | undefined
  >(undefined);
  const [cvMode, setCvMode] = useState<CvMode>("upload");
  const [saveMasterCv, setSaveMasterCv] = useState(false);
  const [fileHover, setFileHover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [authReady, setAuthReady] = useState(false);
  const jobDescriptionFilledTrackedRef = useRef(false);
  const jobDescriptionFocusTrackedRef = useRef(false);
  const jobDescriptionPasteTrackedRef = useRef(false);
  const flowSessionIdRef = useRef<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstilePendingTokenResolverRef = useRef<
    ((token: string | null) => void) | null
  >(null);
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);

  const resolvePendingTurnstileToken = useCallback((token: string | null) => {
    const resolve = turnstilePendingTokenResolverRef.current;
    if (!resolve) {
      return;
    }

    turnstilePendingTokenResolverRef.current = null;
    resolve(token);
  }, []);

  const renderInvisibleTurnstileWidget = useCallback(() => {
    if (!turnstileSiteKey || turnstileWidgetIdRef.current) {
      return;
    }

    const turnstile = window.turnstile;
    const container = turnstileContainerRef.current;
    if (!turnstile?.render || !container) {
      return;
    }

    turnstileWidgetIdRef.current = turnstile.render(container, {
      sitekey: turnstileSiteKey,
      appearance: "execute",
      execution: "execute",
      size: "normal",
      callback: (token) => {
        resolvePendingTurnstileToken(token.trim() || null);
      },
      "error-callback": () => {
        resolvePendingTurnstileToken(null);
      },
      "expired-callback": () => {
        resolvePendingTurnstileToken(null);
      },
    });
  }, [resolvePendingTurnstileToken, turnstileSiteKey]);

  const requestTurnstileToken = useCallback(async () => {
    const fallbackToken = readTurnstileTokenFromDom();

    if (!turnstileSiteKey) {
      return fallbackToken;
    }

    const turnstile = window.turnstile;
    if (!turnstile?.execute) {
      return fallbackToken;
    }

    renderInvisibleTurnstileWidget();

    const widgetId = turnstileWidgetIdRef.current;
    if (!widgetId) {
      return fallbackToken;
    }

    return new Promise<string | null>((resolve) => {
      const timeoutId = setTimeout(() => {
        turnstilePendingTokenResolverRef.current = null;
        resolve(readTurnstileTokenFromDom() ?? null);
      }, 2000);

      turnstilePendingTokenResolverRef.current = (token) => {
        clearTimeout(timeoutId);
        resolve(token ?? readTurnstileTokenFromDom() ?? null);
      };

      try {
        turnstile.execute(widgetId);
      } catch {
        clearTimeout(timeoutId);
        turnstilePendingTokenResolverRef.current = null;
        resolve(fallbackToken);
      }
    });
  }, [renderInvisibleTurnstileWidget, turnstileSiteKey]);

  const getFlowSessionId = useCallback(() => {
    if (flowSessionIdRef.current) {
      return flowSessionIdRef.current;
    }

    if (typeof sessionStorage === "undefined") {
      return null;
    }

    const existingSessionId = sessionStorage.getItem(ADAPT_FLOW_SESSION_ID_KEY);
    if (existingSessionId) {
      flowSessionIdRef.current = existingSessionId;
      return existingSessionId;
    }

    const nextSessionId = buildClientAttemptId();
    sessionStorage.setItem(ADAPT_FLOW_SESSION_ID_KEY, nextSessionId);
    flowSessionIdRef.current = nextSessionId;
    return nextSessionId;
  }, []);

  const emitUiFunnelEvent = useCallback(
    (
      eventName: string,
      payload?: {
        attemptId?: string;
        metadata?: Record<string, unknown>;
      },
    ) => {
      const flowSessionId = getFlowSessionId();
      if (!flowSessionId) {
        return;
      }

      const attemptId = payload?.attemptId ?? "ui";
      const idempotencyKey = buildFunnelEventIdempotencyKey({
        flowSessionId,
        attemptId,
        eventName,
      });

      const route =
        typeof window !== "undefined" ? window.location.pathname : "/adaptar";
      const previousRoute =
        typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem("journey_previous_route")
          : null;
      const routeVisitId =
        typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem("journey_current_route_visit_id")
          : null;
      const journeySessionId =
        typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem("journey_session_internal_id")
          : null;

      void trackEvent({
        eventName,
        eventVersion: 1,
        idempotencyKey,
        properties: {
          occurredAt: new Date().toISOString(),
          previous_route: previousRoute,
          route,
          routeVisitId,
          sessionInternalId: journeySessionId ?? flowSessionId,
          userId: null,
          ...payload?.metadata,
        },
      }).catch(() => undefined);
    },
    [getFlowSessionId],
  );

  useEffect(() => {
    router.prefetch("/adaptar/resultado");
    Promise.all([
      getAuthStatus(),
      getMyMasterResume().catch(() => null as ResumeDto | null),
    ]).then(([status, resume]) => {
      setUserName(status.userName ?? null);
      setAvailableCredits(status.availableCreditsDisplay);
      setMasterResume(resume ?? null);
      if (status.userName && resume) {
        setCvMode("master");
      } else {
        setCvMode("upload");
      }
      setAuthReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const intervals = [0, 3000, 6000, 10000];
    const timers = intervals.map((delay, i) =>
      setTimeout(() => setLoadingStep(i), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  useEffect(() => {
    if (window.turnstile) {
      setTurnstileScriptReady(true);
    }
  }, []);

  useEffect(() => {
    if (!turnstileScriptReady) {
      return;
    }

    renderInvisibleTurnstileWidget();
  }, [renderInvisibleTurnstileWidget, turnstileScriptReady]);

  const isAuthenticated = !!userName;
  const hasMaster = !!masterResume;

  const validateCvTextInput = (input: string): string | null => {
    const normalized = input.trim();
    if (!normalized) {
      return "Digite o texto do seu CV.";
    }

    if (normalized.length < 120) {
      return "O texto do CV está muito curto. Inclua mais detalhes antes de analisar.";
    }

    const nonEmptyLines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (nonEmptyLines.length < 3) {
      return "Organize o CV em mais linhas (resumo, experiências e competências, por exemplo).";
    }

    const hasCommonCvSection =
      /(experi[eê]ncia|forma[cç][aã]o|habilidades|compet[eê]ncias|resumo|projetos|idiomas|certifica[cç][oõ]es)/i.test(
        normalized,
      );
    const hasDateSignal = /\b(19|20)\d{2}\b/.test(normalized);

    if (!hasCommonCvSection && !hasDateSignal) {
      return "Esse texto não parece ser um currículo. Inclua seções como experiência, formação ou competências.";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitAttemptId = buildClientAttemptId();
    emitUiFunnelEvent("analyze_submit_clicked", {
      attemptId: submitAttemptId,
      metadata: {
        cvMode,
        isAuthenticated,
      },
    });

    const isTextMode = cvMode === "text";
    const requiresUploadedFile =
      cvMode === "upload" || (!isAuthenticated && !isTextMode);

    if (requiresUploadedFile && !file) {
      setError("Selecione seu CV em PDF, DOCX ou DOC.");
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setError("O arquivo é muito grande. Envie um PDF de até 5 MB.");
      return;
    }
    if (!jobDescription.trim()) {
      setError("Cole a descrição da vaga.");
      return;
    }

    if (isTextMode) {
      const cvTextError = validateCvTextInput(cvText);
      if (cvTextError) {
        setError(cvTextError);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("jobDescriptionText", jobDescription);
      if (isTextMode) {
        formData.append("masterCvText", cvText.trim());
      }
      const turnstileToken = await requestTurnstileToken();
      appendTurnstileTokenToAnalyzeFormData(formData, turnstileToken);
      let analyzeResult: Awaited<ReturnType<typeof analyzeAuthenticatedCv>>;
      if (isAuthenticated && cvMode === "master" && masterResume) {
        formData.append("masterResumeId", masterResume.id);
        emitUiFunnelEvent("analysis_started", {
          attemptId: submitAttemptId,
          metadata: {
            cvMode,
            isAuthenticated,
          },
        });
        const [result] = await Promise.all([
          analyzeAuthenticatedCv(formData),
          new Promise((r) => setTimeout(r, ANALYSIS_MIN_LOADING_MS)),
        ]);
        analyzeResult = result;
      } else if (isAuthenticated && cvMode === "upload" && file) {
        formData.append("file", file);
        if (saveMasterCv) formData.append("saveAsMaster", "true");
        emitUiFunnelEvent("analysis_started", {
          attemptId: submitAttemptId,
          metadata: {
            cvMode,
            isAuthenticated,
          },
        });
        const [result] = await Promise.all([
          analyzeAuthenticatedCv(formData),
          new Promise((r) => setTimeout(r, ANALYSIS_MIN_LOADING_MS)),
        ]);
        analyzeResult = result;
      } else if (isAuthenticated && cvMode === "text") {
        emitUiFunnelEvent("analysis_started", {
          attemptId: submitAttemptId,
          metadata: {
            cvMode,
            isAuthenticated,
          },
        });
        const [result] = await Promise.all([
          analyzeAuthenticatedCv(formData),
          new Promise((r) => setTimeout(r, ANALYSIS_MIN_LOADING_MS)),
        ]);
        analyzeResult = result;
      } else {
        if (cvMode === "text") {
          emitUiFunnelEvent("analysis_started", {
            attemptId: submitAttemptId,
            metadata: {
              cvMode,
              isAuthenticated,
            },
          });
          const [result] = await Promise.all([
            analyzeGuestCv(formData),
            new Promise((r) => setTimeout(r, ANALYSIS_MIN_LOADING_MS)),
          ]);
          analyzeResult = result;
          if (!analyzeResult.ok) {
            setLoading(false);
            setError(analyzeResult.error);
            return;
          }
          setLoadingStep(3);
          await new Promise((r) => setTimeout(r, RESULT_TRANSITION_DELAY_MS));
          setGuestAnalysisRaw(
            JSON.stringify({
              ...analyzeResult,
              jobDescriptionText: jobDescription,
            }),
          );
          router.push("/adaptar/resultado");
          return;
        }

        const uploadedFile = file;
        if (!uploadedFile) {
          setError("Selecione seu CV em PDF, DOCX ou DOC.");
          setLoading(false);
          return;
        }
        formData.append("file", uploadedFile);
        emitUiFunnelEvent("analysis_started", {
          attemptId: submitAttemptId,
          metadata: {
            cvMode,
            isAuthenticated,
          },
        });
        const [result] = await Promise.all([
          analyzeGuestCv(formData),
          new Promise((r) => setTimeout(r, ANALYSIS_MIN_LOADING_MS)),
        ]);
        analyzeResult = result;
      }
      if (!analyzeResult.ok) {
        setLoading(false);
        setError(analyzeResult.error);
        return;
      }
      setLoadingStep(3);
      await new Promise((r) => setTimeout(r, RESULT_TRANSITION_DELAY_MS));

      if (isAuthenticated) {
        try {
          const saved = await saveGuestPreview({
            adaptedContentJson: analyzeResult.adaptedContentJson,
            companyName: analyzeResult.adaptedContentJson?.vaga?.empresa,
            jobDescriptionText: jobDescription,
            jobTitle: analyzeResult.adaptedContentJson?.vaga?.cargo,
            masterCvText: analyzeResult.masterCvText,
            analysisCvSnapshotId: analyzeResult.analysisCvSnapshotId,
            previewText: analyzeResult.previewText,
            saveAsMaster: saveMasterCv,
            file: file ?? undefined,
          });

          router.push(`/adaptar/resultado?adaptationId=${saved.id}`);
          return;
        } catch {
          // fallback to session storage path
        }
      }

      setGuestAnalysisRaw(
        JSON.stringify({
          ...analyzeResult,
          jobDescriptionText: jobDescription,
        }),
      );
      router.push("/adaptar/resultado");
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao analisar CV. Tente novamente.",
      );
    }
  };

  if (!authReady) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d0ceC6] border-t-[#0a0a0a]" />
      </div>
    );
  }

  return (
    <PageShell>
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={() => {
            setTurnstileScriptReady(true);
          }}
        />
      ) : null}
      <main
        style={{
          fontFamily: GEIST,
          color: "#0a0a0a",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          minHeight: "100dvh",
          position: "relative",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Grain */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.5,
            mixBlendMode: "multiply",
            zIndex: 0,
            backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
          }}
        />

        <AppHeader userName={userName} availableCredits={availableCredits} />
        <div
          ref={turnstileContainerRef}
          aria-hidden
          style={{
            position: "fixed",
            left: -10000,
            top: -10000,
            width: 320,
            height: 80,
            pointerEvents: "none",
            opacity: 0,
          }}
        />

        {/* Main */}
        <div
          className="adaptar-content"
          style={{
            flex: 1,
            padding: "32px 32px 28px",
            position: "relative",
            zIndex: 2,
            maxWidth: 1200,
            margin: "0 auto",
            width: "100%",
          }}
        >
          {/* Header */}
          <div style={{ maxWidth: 780, marginBottom: 28 }}>
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
                marginBottom: 14,
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
                }}
              />
              ANÁLISE EM ATÉ 2 MINUTOS
            </div>
            <h1
              style={{
                fontSize: "clamp(26px, 6vw, 46px)",
                fontWeight: 500,
                letterSpacing: -1.8,
                lineHeight: 1.04,
                margin: 0,
                color: "#0a0a0a",
              }}
            >
              Cole a vaga, envie seu CV.
              <br />
              Descubra{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                exatamente{" "}
              </em>
              por que você
              <br />
              está sendo eliminado.
            </h1>
          </div>

          {/* 2-col grid */}
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr",
                gap: 40,
                alignItems: "start",
              }}
              className="adaptar-grid"
            >
              {/* Left column */}
              <div>
                {/* Error */}
                {error && (
                  <div
                    ref={errorRef}
                    style={{
                      marginBottom: 16,
                      padding: "10px 14px",
                      background: "#fee2e2",
                      border: "1px solid #fecaca",
                      borderRadius: 10,
                      fontSize: 13,
                      color: "#991b1b",
                      fontFamily: MONO,
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Step 01 — CV */}
                <div style={{ marginBottom: 14 }}>
                  <div
                    className="adaptar-cv-header"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        fontWeight: 500,
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#0a0a0a",
                        color: "#fafaf6",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      01
                    </div>
                    <div className="adaptar-cv-heading" style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          letterSpacing: -0.2,
                        }}
                      >
                        Seu CV
                      </div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#7a7a74",
                          letterSpacing: 0.3,
                        }}
                      >
                        PDF, DOC ou DOCX · até 5 MB
                      </div>
                    </div>
                    {/* Mode toggle */}
                    {isAuthenticated && (
                      <div className="adaptar-cv-toggle-row">
                        <div
                          className="adaptar-cv-mode-toggle"
                          style={{
                            display: "flex",
                            gap: 4,
                            background: "rgba(10,10,10,0.05)",
                            borderRadius: 8,
                            padding: 3,
                          }}
                        >
                          {(hasMaster
                            ? (["master", "upload", "text"] as CvMode[])
                            : (["upload", "text"] as CvMode[])
                          ).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => {
                                setCvMode(mode);
                                if (mode === "master") setFile(null);
                                if (mode === "text") setFile(null);
                                setError(null);
                              }}
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                fontWeight: 500,
                                letterSpacing: 0.3,
                                padding: "4px 10px",
                                borderRadius: 6,
                                border: "none",
                                cursor: "pointer",
                                background:
                                  cvMode === mode ? "#0a0a0a" : "transparent",
                                color: cvMode === mode ? "#fafaf6" : "#7a7a74",
                                transition: "all 120ms",
                              }}
                            >
                              {mode === "master"
                                ? "CV base"
                                : mode === "upload"
                                  ? hasMaster
                                    ? "Outro CV"
                                    : "Upload"
                                  : "Digitar texto"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!isAuthenticated && (
                      <div className="adaptar-cv-toggle-row">
                        <div
                          className="adaptar-cv-mode-toggle"
                          style={{
                            display: "flex",
                            gap: 4,
                            background: "rgba(10,10,10,0.05)",
                            borderRadius: 8,
                            padding: 3,
                          }}
                        >
                          {(["upload", "text"] as CvMode[]).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => {
                                setCvMode(mode);
                                if (mode === "text") setFile(null);
                                setError(null);
                              }}
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                fontWeight: 500,
                                letterSpacing: 0.3,
                                padding: "4px 10px",
                                borderRadius: 6,
                                border: "none",
                                cursor: "pointer",
                                background:
                                  cvMode === mode ? "#0a0a0a" : "transparent",
                                color: cvMode === mode ? "#fafaf6" : "#7a7a74",
                                transition: "all 120ms",
                              }}
                            >
                              {mode === "upload" ? "Upload" : "Digitar texto"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Master selected */}
                  {isAuthenticated && hasMaster && cvMode === "master" ? (
                    <div
                      style={{
                        background: "#fafaf6",
                        border: "1px solid rgba(10,10,10,0.08)",
                        borderRadius: 14,
                        padding: "28px 20px",
                        textAlign: "center",
                        minHeight: CV_INPUT_BOX_MIN_HEIGHT,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          marginBottom: 10,
                        }}
                      >
                        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                            stroke="#0a0a0a"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <polyline
                            points="14 2 14 8 20 8"
                            stroke="#0a0a0a"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        {masterResume.sourceFileName ?? masterResume.title}
                      </div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#8a8a85",
                        }}
                      >
                        CV base carregado ·{" "}
                        <span style={{ color: "#405410" }}>✓ pronto</span>
                      </div>
                    </div>
                  ) : cvMode === "text" ? (
                    <div
                      style={{
                        width: "100%",
                        border: "1.5px dashed #d0ceC6",
                        borderRadius: 14,
                        padding: "14px 14px 10px",
                        background: "#fafaf6",
                        minHeight: CV_INPUT_BOX_MIN_HEIGHT,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <textarea
                        value={cvText}
                        onChange={(e) =>
                          setCvText(e.target.value.slice(0, 20000))
                        }
                        placeholder="Cole seu currículo em texto (resumo, experiências, formação, competências)..."
                        style={{
                          width: "100%",
                          border: "none",
                          outline: "none",
                          fontFamily: GEIST,
                          fontSize: 13.5,
                          lineHeight: 1.5,
                          color: "#0a0a0a",
                          resize: "none",
                          minHeight: 0,
                          flex: 1,
                          background: "transparent",
                        }}
                      />
                      <div
                        style={{
                          marginTop: 8,
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#7a7a74",
                          letterSpacing: 0.3,
                        }}
                      >
                        Sem upload. Use texto real do seu CV para manter
                        rastreabilidade.
                      </div>
                    </div>
                  ) : (
                    /* Upload area */
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          fileInputRef.current?.click();
                        }}
                        onMouseEnter={() => setFileHover(true)}
                        onMouseLeave={() => setFileHover(false)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                          setFileHover(true);
                        }}
                        onDragLeave={() => setFileHover(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setFileHover(false);
                          const droppedFile = e.dataTransfer.files?.[0] ?? null;
                          if (!droppedFile) return;
                          const ext =
                            droppedFile.name.split(".").pop()?.toLowerCase() ??
                            "";
                          if (!["pdf", "doc", "docx", "odt"].includes(ext)) {
                            setError(
                              "Formato inválido. Envie um arquivo PDF, DOC, DOCX ou ODT.",
                            );
                            return;
                          }
                          setFile(droppedFile);
                          setCvMode("upload");
                          emitUiFunnelEvent("cv_upload_completed", {
                            attemptId: buildClientAttemptId(),
                            metadata: {
                              fileExtension:
                                droppedFile.name
                                  .split(".")
                                  .pop()
                                  ?.toLowerCase() ?? null,
                            },
                          });
                        }}
                        style={{
                          width: "100%",
                          border: `1.5px dashed ${fileHover || file ? "#0a0a0a" : "#d0ceC6"}`,
                          borderRadius: 14,
                          padding: "35px 20px",
                          textAlign: "center",
                          background: fileHover ? "#f5f4ee" : "#fafaf6",
                          cursor: "pointer",
                          transition: "border-color 120ms, background 120ms",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 8,
                          minHeight: CV_INPUT_BOX_MIN_HEIGHT,
                          justifyContent: "center",
                        }}
                      >
                        {file ? (
                          <>
                            {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                            <svg
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden
                            >
                              <path
                                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                                stroke="#0a0a0a"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <polyline
                                points="14 2 14 8 20 8"
                                stroke="#0a0a0a"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>
                              {file.name}
                            </span>
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                color: "#8a8a85",
                              }}
                            >
                              clique para trocar
                            </span>
                          </>
                        ) : (
                          <>
                            {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                            <svg
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden
                            >
                              <path
                                d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16"
                                stroke="#0a0a0a"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>
                              Arraste ou clique para enviar
                            </span>
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                color: "#8a8a85",
                              }}
                            >
                              seu-cv.pdf · ou solte aqui
                            </span>
                          </>
                        )}
                      </button>
                      {isAuthenticated && file && (
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 10,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={saveMasterCv}
                            onChange={(e) => setSaveMasterCv(e.target.checked)}
                            style={{
                              accentColor: "#0a0a0a",
                              width: 14,
                              height: 14,
                            }}
                          />
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 10.5,
                              color: "#7a7a74",
                              letterSpacing: 0.2,
                            }}
                          >
                            {hasMaster
                              ? "Salvar como novo CV base (substitui o atual)"
                              : "Salvar como CV base para próximas análises"}
                          </span>
                        </label>
                      )}
                    </>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.odt"
                    className="hidden"
                    onChange={(e) => {
                      const nextFile = e.target.files?.[0] ?? null;
                      setFile(nextFile);
                      if (nextFile) {
                        setCvMode("upload");
                      }
                      if (nextFile) {
                        emitUiFunnelEvent("cv_upload_completed", {
                          attemptId: buildClientAttemptId(),
                          metadata: {
                            fileExtension:
                              nextFile.name.split(".").pop()?.toLowerCase() ??
                              null,
                          },
                        });
                      }
                    }}
                  />
                </div>

                {/* Step 02 — Vaga */}
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        fontWeight: 500,
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#0a0a0a",
                        color: "#fafaf6",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      02
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          letterSpacing: -0.2,
                        }}
                      >
                        Descrição da vaga
                      </div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#7a7a74",
                          letterSpacing: 0.3,
                        }}
                      >
                        LinkedIn, Gupy, Infojobs, etc.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => setJobDescription(EXAMPLE_JOB)}
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#0a0a0a",
                          background: "none",
                          border: "none",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                          cursor: "pointer",
                          letterSpacing: 0.3,
                        }}
                      >
                        colar exemplo
                      </button>
                      {jobDescription && (
                        <button
                          type="button"
                          onClick={() => setJobDescription("")}
                          style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color: "#8a8a85",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          limpar
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      background: "#fafaf6",
                      border: "1px solid #d8d6ce",
                      borderRadius: 12,
                      padding: "12px 14px",
                    }}
                  >
                    <textarea
                      value={jobDescription}
                      onFocus={() => {
                        if (jobDescriptionFocusTrackedRef.current) {
                          return;
                        }

                        jobDescriptionFocusTrackedRef.current = true;
                        emitUiFunnelEvent("job_description_focus");
                      }}
                      onPaste={() => {
                        if (jobDescriptionPasteTrackedRef.current) {
                          return;
                        }

                        jobDescriptionPasteTrackedRef.current = true;
                        emitUiFunnelEvent("job_description_paste");
                      }}
                      onChange={(e) => {
                        const nextJobDescription = e.target.value.slice(
                          0,
                          12000,
                        );
                        setJobDescription(nextJobDescription);

                        if (
                          !jobDescriptionFilledTrackedRef.current &&
                          nextJobDescription.trim()
                        ) {
                          jobDescriptionFilledTrackedRef.current = true;
                          emitUiFunnelEvent("job_description_filled");
                        }
                      }}
                      placeholder="Cole a vaga completa (isso melhora sua análise)..."
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        fontFamily: GEIST,
                        fontSize: 13.5,
                        background: "transparent",
                        color: "#0a0a0a",
                        minHeight: 128,
                        resize: "none",
                        lineHeight: 1.55,
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        borderTop: "1px solid rgba(10,10,10,0.06)",
                        paddingTop: 8,
                        marginTop: 6,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#8a8a85",
                        }}
                      >
                        {jobDescription.length} / 12000
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#8a8a85",
                        }}
                      >
                        ⌘+V para colar
                      </span>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    background: "#0a0a0a",
                    color: "#fafaf6",
                    border: "none",
                    borderRadius: 12,
                    padding: "15px",
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: loading ? "wait" : "pointer",
                    fontFamily: GEIST,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    boxShadow:
                      "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
                    letterSpacing: -0.1,
                    transition: "opacity 150ms",
                    opacity: loading ? 0.75 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                      <svg
                        aria-hidden
                        className="animate-spin"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      <span>{LOADING_STEPS[loadingStep]}</span>
                    </>
                  ) : (
                    <>
                      <span>Descobrir meus erros no CV</span>
                      <span>→</span>
                    </>
                  )}
                </button>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#8a8a85",
                    textAlign: "center",
                    marginTop: 10,
                    letterSpacing: 0.3,
                  }}
                >
                  Grátis • sem cartão • resultado em segundos
                </div>
              </div>

              {/* Right column */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    color: "#8a8a85",
                    fontWeight: 500,
                  }}
                >
                  O QUE VOCÊ VAI RECEBER
                </div>

                {/* Preview card */}
                <div
                  style={{
                    background: "#0a0a0a",
                    color: "#f0efe9",
                    borderRadius: 14,
                    padding: "20px 22px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      color: "#a0a098",
                      marginBottom: 14,
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#c6ff3a",
                        display: "inline-block",
                      }}
                    />
                    RELATÓRIO PRÉVIA
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 500,
                      letterSpacing: -0.4,
                      color: "#fafaf6",
                      marginBottom: 16,
                    }}
                  >
                    Relatório de alinhamento
                  </div>
                  {[
                    { k: "ATS SCORE", v: "0–100" },
                    { k: "KEYWORDS", v: "presentes · ausentes" },
                    { k: "VERBOS DE AÇÃO", v: "mapeados da vaga" },
                    { k: "FORMATAÇÃO", v: "problemas estruturais" },
                    { k: "SUGESTÕES", v: "por seção" },
                  ].map((row) => (
                    <div
                      key={row.k}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        padding: "9px 0",
                        borderTop: "1px solid rgba(250,250,246,0.08)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#a0a098",
                          letterSpacing: 0.5,
                        }}
                      >
                        {row.k}
                      </span>
                      <span style={{ fontSize: 13, color: "#e8e7df" }}>
                        {row.v}
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: "1px solid rgba(250,250,246,0.08)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: "#7a7a74",
                        letterSpacing: 0.2,
                        lineHeight: 1.5,
                      }}
                    >
                      Priv: seus dados não são usados para treinar modelos.
                    </span>
                  </div>
                </div>

                {/* Trust badges */}
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { label: "DIAGNÓSTICO", v: "≈ 2min" },
                    { label: "DADOS", v: "protegidos" },
                    { label: "MELHORIAS", v: "10+" },
                  ].map((b) => (
                    <div
                      key={b.label}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        padding: "10px 12px",
                        background: "rgba(10,10,10,0.03)",
                        border: "1px solid rgba(10,10,10,0.06)",
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          color: "#8a8a85",
                          letterSpacing: 0.5,
                        }}
                      >
                        {b.label}
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 500,
                          letterSpacing: -0.5,
                        }}
                      >
                        {b.v}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </div>

        <style>{`
          @media (max-width: 860px) {
            .adaptar-grid { grid-template-columns: 1fr !important; }
          }
          @media (max-width: 768px) {
            .adaptar-content { padding: 20px 16px 28px !important; }
            .adaptar-cv-header {
              flex-wrap: wrap;
              align-items: flex-start !important;
              gap: 10px !important;
            }
            .adaptar-cv-toggle-row {
              width: 100%;
              display: flex;
              justify-content: flex-end;
            }
          }
        `}</style>
      </main>
    </PageShell>
  );
}
