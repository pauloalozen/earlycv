"use client";

import Script from "next/script";
import { useState } from "react";
import { EcvScanLoader } from "@/components/ecv-loader";
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

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// CTA de cadastro pós-preview — mesmo padrão de SIGNUP_NEXT_CV/
// SIGNUP_NEXT_MONITOR em radar/[slug]/page.tsx (ctx=radar, já um valor
// válido de SignupConversionContext). O claim do AnalysisJob guest não
// depende de nada na URL — login-form/register-form/google-auth-button já
// leem sessionStorage("guest_analysis_pending") (setPendingGuestAnalysis,
// chamado dentro de runRadarGuestAnalysisFlow) e fazem o claim sozinhos.
const SIGNUP_NEXT_ANALYSIS_RESULT = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent(
  "/adaptar/resultado",
)}`;

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
      <div style={{ fontSize: 11, color: "#c8c6bf", marginBottom: 3 }}>
        {label}
      </div>
      <div
        style={{
          height: 5,
          background: "rgba(250,250,246,0.1)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${coveragePercent}%`,
            background: "#c6ff3a",
          }}
        />
      </div>
    </div>
  );
}

function ScoreBadge({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: -1,
          lineHeight: 1,
          color: "#fafaf6",
        }}
      >
        {value}%
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: "#8a8a85",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function PreviewCard({
  jobTitle,
  preview,
}: {
  jobTitle: string;
  preview: SucceededRadarAnalysisPreview;
}) {
  const before = preview.score?.before ?? null;
  const after = preview.score?.after ?? null;
  const hasImprovementPotential =
    after !== null && before !== null && after > before;

  return (
    <div style={{ flex: 1, minWidth: 260 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.3,
          color: "#8a8a85",
          fontWeight: 500,
          marginBottom: 10,
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
        SEU MATCH COM ESTA VAGA
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          marginBottom: 16,
        }}
      >
        {before !== null ? (
          <ScoreBadge value={before} label="compatibilidade atual" />
        ) : null}
        {hasImprovementPotential ? (
          <ScoreBadge value={after as number} label="potencial estimado" />
        ) : null}
      </div>

      {preview.breakdown && preview.breakdown.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 340,
            marginBottom: 14,
          }}
        >
          {preview.breakdown.map((row) => (
            <Bar
              key={row.dimension}
              label={row.label}
              coveragePercent={row.coveragePercent}
            />
          ))}
        </div>
      ) : null}

      {typeof preview.gapsCount === "number" && preview.gapsCount > 0 ? (
        <div style={{ fontSize: 13, color: "#e8e6df", marginBottom: 4 }}>
          Encontramos {preview.gapsCount}{" "}
          {preview.gapsCount === 1 ? "ponto" : "pontos"} que{" "}
          {preview.gapsCount === 1 ? "pode" : "podem"} estar reduzindo sua
          aderência a essa vaga de {jobTitle}.
        </div>
      ) : null}
    </div>
  );
}

export function RadarGuestAnalysisBand({
  jobId,
  jobTitle,
}: {
  jobId: string;
  jobTitle: string;
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
  }

  async function handleAnalyze() {
    if (!file || phase === "loading") return;

    setPhase("loading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("radarJobId", jobId);
      formData.append("file", file);

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
        borderRadius: 16,
        padding: "26px 28px",
        marginBottom: 28,
        color: "#fafaf6",
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        {phase === "preview" && preview ? (
          <PreviewCard jobTitle={jobTitle} preview={preview} />
        ) : (
          <div style={{ flex: 1, minWidth: 260 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.3,
                color: "#8a8a85",
                fontWeight: 500,
                marginBottom: 10,
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
              ANÁLISE DE COMPATIBILIDADE COM IA
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: -0.4,
                lineHeight: 1.3,
                marginBottom: 10,
                maxWidth: 420,
              }}
            >
              Seu currículo passaria pelos filtros da vaga de {jobTitle}?
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#c8c6bf",
                marginBottom: 4,
              }}
            >
              Envie seu CV e descubra seu nível de compatibilidade com essa vaga
              em segundos — sem precisar criar conta.
            </div>
          </div>
        )}

        <div
          style={{
            flexShrink: 0,
            width: 280,
            textAlign: "center",
            background: "rgba(250,250,246,0.04)",
            border: "1px solid rgba(250,250,246,0.08)",
            borderRadius: 14,
            padding: "22px 24px",
          }}
        >
          {phase === "preview" ? (
            <a
              href={SIGNUP_NEXT_ANALYSIS_RESULT}
              style={{
                display: "block",
                boxSizing: "border-box",
                width: "100%",
                background: "#c6ff3a",
                color: "#1c2a05",
                borderRadius: 9,
                padding: "13px 16px",
                fontSize: 13.5,
                fontWeight: 700,
                textDecoration: "none",
                textAlign: "center",
                lineHeight: 1.35,
              }}
            >
              Criar conta grátis e ver análise completa →
            </a>
          ) : (
            <>
              <div
                role={error ? "alert" : undefined}
                style={{
                  fontSize: 12.5,
                  color: error ? "#fca5a5" : "#e8e6df",
                  marginBottom: 14,
                }}
              >
                {error ??
                  "Suba seu CV pra ver seu número — e onde você ganha ou perde pontos."}
              </div>

              {phase === "loading" ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <EcvScanLoader size={28} />
                  <div style={{ fontSize: 12.5, color: "#c8c6bf" }}>
                    Analisando seu CV contra a vaga...
                  </div>
                </div>
              ) : (
                <>
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
                      background: "rgba(250,250,246,0.02)",
                      border: `1.5px dashed ${
                        fileHover || file ? "#c6ff3a" : "rgba(250,250,246,0.2)"
                      }`,
                      borderRadius: 10,
                      padding: "16px 10px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      marginBottom: 10,
                      fontFamily: GEIST,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {file ? file.name : "Envie seu currículo"}
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
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={!file}
                    style={{
                      display: "block",
                      width: "100%",
                      background: file ? "#c6ff3a" : "rgba(250,250,246,0.12)",
                      color: file ? "#1c2a05" : "#6a6a66",
                      border: "none",
                      borderRadius: 9,
                      padding: "13px 18px",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: file ? "pointer" : "not-allowed",
                      whiteSpace: "nowrap",
                      fontFamily: GEIST,
                    }}
                  >
                    Analisar meu CV para esta vaga →
                  </button>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#6a6560",
                      marginTop: 10,
                    }}
                  >
                    Grátis · resultado em segundos
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
