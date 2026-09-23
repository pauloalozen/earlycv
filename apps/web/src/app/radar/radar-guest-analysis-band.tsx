"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { ScoreRing, scoreColor } from "@/app/radar/radar-ui";
import { trackEvent } from "@/lib/analytics-tracking";
import { appendTurnstileTokenToAnalyzeFormData } from "@/lib/cv-adaptation-flow-helpers";
import {
  getJourneySessionInternalId,
  resolveJobProductOrigin,
} from "@/lib/journey-session";
import { runRadarGuestAnalysisFlow } from "@/lib/radar-guest-analysis-flow";
import type { SucceededRadarAnalysisPreview } from "@/lib/radar-guest-analysis-preview";
import { useTurnstileToken } from "@/lib/use-turnstile-token";
import { getOrCreateVisitorId } from "@/lib/visitor-id";
import { useRadarAnalysisPreview } from "./radar-analysis-preview-context";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Bloco principal de conversão do Radar (/radar/[slug]) — reaproveita
// runRadarGuestAnalysisFlow/useTurnstileToken/analyzeGuestCv por trás
// dela, sem pipeline paralelo. Usa ScoreRing/scoreColor (os mesmos do
// CompatCard logado, pra manter a mesma linguagem visual entre guest e
// logado), estado de transição com checklist (Zeigarnik effect) e copy
// de curiosity gap.
const LOADING_STEPS = [
  { label: "Lendo seu currículo", done: true },
  { label: "Comparando com os requisitos da vaga", done: false },
  { label: "Calculando seu score e o potencial após adaptação", done: false },
];

type Phase = "idle" | "loading" | "preview" | "error";

function Bar({
  label,
  coveragePercent,
}: {
  label: string;
  coveragePercent: number;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12.5,
          marginBottom: 5,
        }}
      >
        <span>{label}</span>
        <span
          style={{
            fontFamily: GEIST,
            fontWeight: 700,
            color: scoreColor(coveragePercent),
          }}
        >
          {coveragePercent}%
        </span>
      </div>
      <div
        style={{
          height: 7,
          background: "rgba(250,250,246,0.08)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${coveragePercent}%`,
            background: scoreColor(coveragePercent),
            borderRadius: 99,
          }}
        />
      </div>
    </div>
  );
}

function LoadingState({ jobTitle }: { jobTitle: string }) {
  // Checklist progressivo — mesmo princípio do rotating-steps da landing
  // (guest-analysis-widget.tsx), aqui como lista com item concluído/atual/
  // pendente em vez de texto rotativo, pra sustentar o efeito Zeigarnik
  // (tarefa em andamento e não concluída puxa a pessoa a ficar na página).
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, LOADING_STEPS.length - 1));
    }, 2600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        textAlign: "center",
        padding: "8px 0",
      }}
    >
      <style>{`
        @keyframes radar-band-spin { to { transform: rotate(360deg); } }
        @keyframes radar-band-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>
      <div style={{ position: "relative", width: 100, height: 100 }}>
        <svg
          width="100"
          height="100"
          viewBox="0 0 100 100"
          style={{ transform: "rotate(-90deg)" }}
        >
          <title>Analisando</title>
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="rgba(250,250,246,0.1)"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="#c6ff3a"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="165 200"
            style={{
              transformOrigin: "50px 50px",
              animation: "radar-band-spin 1.1s linear infinite",
            }}
          />
        </svg>
      </div>
      <div>
        <div
          style={{
            fontFamily: GEIST,
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 6,
          }}
        >
          Comparando seu CV com os requisitos de {jobTitle}...
        </div>
        <div style={{ fontSize: 12.5, color: "#8a8a85" }}>
          Isso leva só alguns segundos.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 11,
          width: "100%",
          maxWidth: 380,
          textAlign: "left",
        }}
      >
        {LOADING_STEPS.map((step, i) => {
          const isDone = i < stepIndex;
          const isCurrent = i === stepIndex;
          return (
            <div
              key={step.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: isCurrent ? 14 : 13.5,
                fontWeight: isCurrent ? 600 : 400,
                color: isDone ? "#6a6560" : isCurrent ? "#fafaf6" : "#5a5750",
                animation: isCurrent
                  ? "radar-band-pulse 1.4s ease-in-out infinite"
                  : undefined,
              }}
            >
              {isDone ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>Concluído</title>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isCurrent ? "#c6ff3a" : "#5a5750"}
                  strokeWidth="2.2"
                >
                  <title>Pendente</title>
                  <circle cx="12" cy="12" r="9" />
                </svg>
              )}
              <span
                style={
                  isDone
                    ? {
                        textDecoration: "line-through",
                        textDecorationColor: "rgba(106,101,96,0.4)",
                      }
                    : undefined
                }
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: "#6a6560" }}>
        não saia desta página — seu resultado aparece bem aqui
      </div>
    </div>
  );
}

// Preview limitado a exatamente Skills técnicas + Experiência — nunca as
// outras dimensões que a análise real possa ter identificado (educação,
// certificações, idiomas etc.). O objetivo aqui não é mostrar tudo, é
// mostrar uma amostra consistente + a linha travada "outros critérios
// analisados", então dimensões extras são omitidas de propósito, nunca
// adicionadas à lista visível.
const PREVIEW_DIMENSION_ORDER = ["skill", "experience"];

function useRingSize() {
  const [size, setSize] = useState(128);

  useEffect(() => {
    // matchMedia não existe em alguns ambientes de teste (jsdom sem
    // polyfill) — nunca quebra o componente por isso, só mantém o
    // tamanho padrão de desktop.
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(max-width: 480px)");
    const update = () => setSize(query.matches ? 100 : 128);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return size;
}

function PreviewState({
  jobTitle,
  preview,
  signupHref,
}: {
  jobTitle: string;
  preview: SucceededRadarAnalysisPreview;
  signupHref: string;
}) {
  const before = preview.score?.before ?? null;
  const after = preview.score?.after ?? null;
  const gap =
    after !== null && before !== null && after > before ? after - before : null;
  const ringSize = useRingSize();
  const isCompact = ringSize < 128;
  const visibleBreakdown = (preview.breakdown ?? [])
    .filter((row) => PREVIEW_DIMENSION_ORDER.includes(row.dimension))
    .sort(
      (a, b) =>
        PREVIEW_DIMENSION_ORDER.indexOf(a.dimension) -
        PREVIEW_DIMENSION_ORDER.indexOf(b.dimension),
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 1.4,
          color: "#c6ff3a",
          fontWeight: 600,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#c6ff3a",
            display: "inline-block",
            boxShadow: "0 0 10px 2px rgba(198,255,58,0.6)",
          }}
        />
        SEU RESULTADO PARA ESTA VAGA
      </div>

      <div
        style={{
          display: "flex",
          gap: isCompact ? 14 : 28,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Grupo dos dois gauges — nunca quebra linha entre si (só o
        bloco de texto abaixo quebra pro próprio flexWrap do container
        pai); no mobile o ringSize encolhe um pouco pra caber os dois na
        mesma linha (ver useRingSize) e o grupo fica centralizado
        no eixo x, já que nesse breakpoint ele ocupa a linha inteira. */}
        <div
          style={{
            display: "flex",
            gap: isCompact ? 10 : 20,
            alignItems: "center",
            justifyContent: isCompact ? "center" : "flex-start",
            flexWrap: "nowrap",
            flexShrink: 0,
            width: isCompact ? "100%" : undefined,
          }}
        >
          {before !== null ? (
            <div style={{ textAlign: "center" }}>
              <ScoreRing value={before} size={ringSize} dark />
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  color: "#8a8a85",
                  marginTop: 6,
                  letterSpacing: 0.3,
                }}
              >
                HOJE
              </div>
            </div>
          ) : null}

          {after !== null && before !== null ? (
            <>
              <svg
                width={isCompact ? 16 : 22}
                height={isCompact ? 16 : 22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#c6ff3a"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <title>Potencial</title>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <div style={{ textAlign: "center" }}>
                <ScoreRing value={after} size={ringSize} dark />
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    color: "#8a8a85",
                    marginTop: 6,
                    letterSpacing: 0.3,
                  }}
                >
                  POTENCIAL
                </div>
              </div>
            </>
          ) : null}
        </div>

        {gap !== null ? (
          <div style={{ flex: 1, minWidth: 220 }}>
            <div
              style={{
                fontFamily: GEIST,
                fontWeight: 700,
                fontSize: 18,
                lineHeight: 1.3,
                marginBottom: 8,
              }}
            >
              Você está deixando{" "}
              <span style={{ color: "#c6ff3a" }}>{gap} pontos</span> na mesa
              nessa vaga.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "#c8c6bf" }}>
              Com os ajustes certos, seu currículo pode chegar a {after}% de
              aderência — sem inventar nada, só reorganizando o que você já tem.
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 0.8,
            color: "#8a8a85",
            marginBottom: 14,
          }}
        >
          ONDE VOCÊ ESTÁ FORTE E ONDE ESTÁ FRACO
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {visibleBreakdown.map((row) => (
            <Bar
              key={row.dimension}
              label={row.label}
              coveragePercent={row.coveragePercent}
            />
          ))}
          {/* Linha travada, sempre presente — sinaliza que existem mais
          critérios analisados além dos revelados aqui, mesmo quando o
          preview só tem 1-2 dimensões reais. */}
          <div style={{ opacity: 0.5 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12.5,
                marginBottom: 5,
              }}
            >
              <span>Outros critérios analisados 🔒</span>
            </div>
            <div
              style={{
                height: 7,
                background:
                  "repeating-linear-gradient(45deg, rgba(250,250,246,0.12) 0px, rgba(250,250,246,0.12) 4px, rgba(250,250,246,0.04) 4px, rgba(250,250,246,0.04) 8px)",
                borderRadius: 99,
              }}
            />
          </div>
        </div>
      </div>

      {typeof preview.gapsCount === "number" && preview.gapsCount > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(198,255,58,0.06)",
            border: "1px solid rgba(198,255,58,0.18)",
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c6ff3a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <title>Atenção</title>
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div style={{ fontSize: 13, color: "#e8e6df" }}>
            Encontramos{" "}
            <strong style={{ color: "#fafaf6" }}>
              {preview.gapsCount} pontos
            </strong>{" "}
            que podem estar reduzindo sua chance nessa vaga de {jobTitle}.
          </div>
        </div>
      ) : null}

      <a
        href={signupHref}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          boxSizing: "border-box",
          background: "#c6ff3a",
          color: "#16210a",
          borderRadius: 13,
          padding: 18,
          fontFamily: GEIST,
          fontSize: 16,
          fontWeight: 600,
          textDecoration: "none",
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {typeof preview.gapsCount === "number" && preview.gapsCount > 0
          ? `Ver os ${preview.gapsCount} pontos e minha análise completa →`
          : "Ver minha análise completa →"}
      </a>
      <div
        style={{
          textAlign: "center",
          fontFamily: MONO,
          fontSize: 10.5,
          color: "#6a6560",
          marginTop: -14,
        }}
      >
        grátis · leva 1 minuto · continua exatamente de onde você parou
      </div>
    </div>
  );
}

export function RadarGuestAnalysisBand({
  jobId,
  jobTitle,
  jobSlug,
}: {
  jobId: string;
  jobTitle: string;
  jobSlug: string;
}) {
  const {
    turnstileSiteKey,
    containerRef: turnstileContainerRef,
    requestToken: requestTurnstileToken,
    onScriptReady: markTurnstileScriptReady,
  } = useTurnstileToken();

  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [fileHover, setFileHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SucceededRadarAnalysisPreview | null>(
    null,
  );
  const [ctaTracked, setCtaTracked] = useState(false);
  const { markPreviewRevealed } = useRadarAnalysisPreview();

  // O fallback aqui só é usado quando o claim da análise guest falha
  // (não confirma nem fica pendente). Precisa apontar pra um lugar com
  // contexto — nunca "/adaptar/resultado" cru, pois essa página trata a
  // ausência de adaptationId/claimJobId como entrada inválida e força
  // bounce pra "/adaptar", deixando o usuário perdido.
  const signupHref = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent(
    `/radar/${jobSlug}`,
  )}`;

  function trackCtaClickOnce() {
    if (ctaTracked) return;
    setCtaTracked(true);
    void trackEvent({
      eventName: "radar_analysis_cta_clicked",
      eventVersion: 1,
      properties: {
        job_id: jobId,
        product_origin: resolveJobProductOrigin(jobId),
        is_authenticated: false,
        has_master_cv: false,
      },
    });
  }

  function selectFile(nextFile: File) {
    if (nextFile.size > 5 * 1024 * 1024) {
      setError("O arquivo é muito grande. Envie um PDF de até 5 MB.");
      return;
    }
    trackCtaClickOnce();
    setFile(nextFile);
    setError(null);
    // Dispara a análise assim que o CV é enviado — sem exigir um segundo
    // clique no botão. Passa o arquivo direto (nunca lê de `file` aqui)
    // porque setFile ainda não foi commitado nesse mesmo tick.
    void handleAnalyze(nextFile);
  }

  async function handleAnalyze(fileOverride?: File) {
    const activeFile = fileOverride ?? file;
    if (!activeFile || phase === "loading") return;

    setPhase("loading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("radarJobId", jobId);
      formData.append("file", activeFile);

      const turnstileToken = await requestTurnstileToken();
      appendTurnstileTokenToAnalyzeFormData(formData, turnstileToken);

      const journeyContext = {
        sessionInternalId: getJourneySessionInternalId(),
        visitorId: getOrCreateVisitorId(),
      };

      const result = await runRadarGuestAnalysisFlow({
        formData,
        journeyContext,
      });

      if (result.kind === "error") {
        setPhase("error");
        setError(result.error);
        return;
      }

      setPreview(result.preview);
      setPhase("preview");
      markPreviewRevealed();
      void trackEvent({
        eventName: "radar_analysis_preview_viewed",
        eventVersion: 1,
        properties: {
          job_id: jobId,
          product_origin: resolveJobProductOrigin(jobId),
          is_authenticated: false,
          score_available: result.preview.score?.before != null,
          improvement_potential_available: result.preview.score?.after != null,
        },
      });
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao analisar CV. Tente novamente.",
      );
    }
  }

  return (
    <div
      id="radar-guest-analysis"
      style={{
        background: "#0a0a0a",
        borderRadius: 22,
        padding: "36px 40px",
        marginBottom: 22,
        color: "#fafaf6",
        boxShadow: "0 24px 60px -24px rgba(0,0,0,0.35)",
        scrollMarginTop: 24,
      }}
    >
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={markTurnstileScriptReady}
        />
      ) : null}
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

      {phase === "loading" ? (
        <LoadingState jobTitle={jobTitle} />
      ) : phase === "preview" && preview ? (
        <PreviewState
          jobTitle={jobTitle}
          preview={preview}
          signupHref={signupHref}
        />
      ) : (
        <div
          style={{
            display: "flex",
            gap: 36,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 260 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.4,
                color: "#c6ff3a",
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  display: "inline-block",
                  boxShadow: "0 0 10px 2px rgba(198,255,58,0.6)",
                }}
              />
              ANÁLISE DE COMPATIBILIDADE COM IA
            </div>

            <h2
              style={{
                margin: "0 0 14px",
                fontFamily: GEIST,
                fontWeight: 800,
                fontSize: 32,
                lineHeight: 1.15,
                letterSpacing: -0.8,
                maxWidth: 440,
              }}
            >
              Será que seu currículo passa pelo filtro desta vaga?
            </h2>

            <p
              style={{
                margin: "0 0 22px",
                fontSize: 15,
                lineHeight: 1.55,
                color: "#c8c6bf",
                maxWidth: 420,
              }}
            >
              Envie seu CV e descubra, em segundos, sua compatibilidade real com{" "}
              {jobTitle} — o que já atende, e onde seu currículo pode estar
              perdendo aderência.
            </p>

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                "100% grátis",
                "Resultado em segundos",
                "Sem criar conta pra ver o preview",
              ].map((text) => (
                <div
                  key={text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 12.5,
                    color: "#a8a6a0",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#c6ff3a"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>Incluído</title>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {text}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              width: 300,
              background: fileHover
                ? "rgba(198,255,58,0.14)"
                : "rgba(198,255,58,0.08)",
              border: `2px dashed ${fileHover || file ? "#c6ff3a" : "rgba(198,255,58,0.5)"}`,
              borderRadius: 16,
              padding: "26px 22px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              transition: "background 120ms ease, border-color 120ms ease",
            }}
          >
            {error ? (
              <div
                role="alert"
                style={{ fontSize: 12.5, color: "#fca5a5", marginBottom: 4 }}
              >
                {error}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("radar-guest-analysis-file-input")
                  ?.click()
              }
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
                  droppedFile.name.split(".").pop()?.toLowerCase() ?? "";
                if (!["pdf", "docx", "odt"].includes(ext)) {
                  setError(
                    "Formato inválido. Envie um arquivo PDF, DOCX ou ODT.",
                  );
                  return;
                }
                selectFile(droppedFile);
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "transparent",
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                fontFamily: GEIST,
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: "50%",
                  background: "rgba(198,255,58,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c6ff3a"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>Enviar CV</title>
                  <path d="M12 3v12M12 3l-4 4M12 3l4 4" />
                  <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fafaf6" }}>
                {file ? file.name : "Arraste seu currículo aqui"}
              </div>
              <div style={{ fontSize: 12, color: "#c8c6bf" }}>
                {file
                  ? "Toque para trocar o arquivo"
                  : "ou clique para selecionar"}
              </div>
              <div style={{ fontSize: 11, color: "#8a8a85" }}>
                PDF, DOCX ou ODT · até 5 MB
              </div>
            </button>
            <input
              id="radar-guest-analysis-file-input"
              type="file"
              accept=".pdf,.docx,.odt"
              className="hidden"
              onChange={(e) => {
                const nextFile = e.target.files?.[0] ?? null;
                if (nextFile) {
                  selectFile(nextFile);
                }
              }}
            />
            {/* Sem botão "Analisar" separado — o upload já dispara a
            análise (ver selectFile). Um botão desabilitado até o upload
            só reforçava a sensação de área "apagada"/não clicável. */}
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#6a6560" }}>
              grátis · leva menos de 1 minuto
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
