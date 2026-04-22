"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import {
  analyzeAuthenticatedCv,
  analyzeGuestCv,
  emitBusinessFunnelEvent,
} from "@/lib/cv-adaptation-api";
import {
  appendTurnstileTokenToAnalyzeFormData,
  buildFunnelEventIdempotencyKey,
} from "@/lib/cv-adaptation-flow-helpers";
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

type CvMode = "master" | "upload";

const ADAPT_FLOW_SESSION_ID_KEY = "adaptFlowSessionId";

function getTurnstileSiteKey() {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
}

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      size: "invisible";
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
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null | undefined>(
    undefined,
  );
  const [masterResume, setMasterResume] = useState<
    ResumeDto | null | undefined
  >(undefined);
  const [cvMode, setCvMode] = useState<CvMode>("master");
  const [saveMasterCv, setSaveMasterCv] = useState(false);
  const [fileHover, setFileHover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authReady, setAuthReady] = useState(false);
  const adaptPageViewTrackedRef = useRef(false);
  const jobDescriptionFilledTrackedRef = useRef(false);
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
      size: "invisible",
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

      void emitBusinessFunnelEvent({
        eventName,
        eventVersion: 1,
        idempotencyKey,
        metadata: payload?.metadata,
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
      setMasterResume(resume ?? null);
      if (status.userName && !resume) setCvMode("upload");
      setAuthReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (!authReady || adaptPageViewTrackedRef.current) {
      return;
    }

    adaptPageViewTrackedRef.current = true;
    emitUiFunnelEvent("adapt_page_view");
  }, [authReady, emitUiFunnelEvent]);

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

    const requiresUploadedFile = !isAuthenticated || cvMode === "upload";

    if (requiresUploadedFile && !file) {
      setError("Selecione seu CV em PDF.");
      return;
    }
    if (!jobDescription.trim()) {
      setError("Cole a descrição da vaga.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("jobDescriptionText", jobDescription);
      const turnstileToken = await requestTurnstileToken();
      appendTurnstileTokenToAnalyzeFormData(formData, turnstileToken);
      let analyzeResult: Awaited<ReturnType<typeof analyzeGuestCv>>;
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
          new Promise((r) => setTimeout(r, 10000)),
        ]);
        analyzeResult = result;
      } else if (isAuthenticated && file) {
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
          new Promise((r) => setTimeout(r, 10000)),
        ]);
        analyzeResult = result;
      } else {
        const uploadedFile = file;
        if (!uploadedFile) {
          setError("Selecione seu CV em PDF.");
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
          new Promise((r) => setTimeout(r, 10000)),
        ]);
        analyzeResult = result;
      }
      setLoadingStep(3);
      await new Promise((r) => setTimeout(r, 2000));
      sessionStorage.setItem(
        "guestAnalysis",
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

        <AppHeader userName={userName} />
        <div
          ref={turnstileContainerRef}
          aria-hidden
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        />

        {/* Main */}
        <div
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
              ANÁLISE · 60 SEGUNDOS
            </div>
            <h1
              style={{
                fontSize: "clamp(32px, 3.5vw, 46px)",
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
                    <div style={{ flex: 1 }}>
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
                    {/* Mode toggle when has master */}
                    {isAuthenticated && hasMaster && (
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          background: "rgba(10,10,10,0.05)",
                          borderRadius: 8,
                          padding: 3,
                        }}
                      >
                        {(["master", "upload"] as CvMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              setCvMode(mode);
                              if (mode === "master") setFile(null);
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
                            {mode === "master" ? "CV base" : "Outro CV"}
                          </button>
                        ))}
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
                  ) : (
                    /* Upload area */
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          emitUiFunnelEvent("cv_upload_started", {
                            attemptId: buildClientAttemptId(),
                          });
                          fileInputRef.current?.click();
                        }}
                        onMouseEnter={() => setFileHover(true)}
                        onMouseLeave={() => setFileHover(false)}
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
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const nextFile = e.target.files?.[0] ?? null;
                      setFile(nextFile);
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
                    { label: "TEMPO MÉDIO", v: "60s" },
                    { label: "CRIPTOGRAFIA", v: "e2e" },
                    { label: "MELHORIAS", v: "20" },
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
        `}</style>
      </main>
    </PageShell>
  );
}
