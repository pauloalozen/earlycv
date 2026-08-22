"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import { downloadFromApi } from "@/lib/client-download";
import type {
  CoverLetterDto,
  CoverLetterLengthMode,
  CoverLetterStyle,
} from "@/lib/job-applications-api";
import { generateOrGetCoverLetter } from "@/lib/job-applications-api";
import { getJourneySessionInternalId } from "@/lib/journey-session";
import { EcvBuildLoader } from "./ecv-loader";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const TRANSITION_MS = 280;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

const STYLE_OPTIONS: Array<{
  value: CoverLetterStyle;
  label: string;
  description: string;
}> = [
  {
    value: "formal",
    label: "Formal",
    description: "Empresas tradicionais, bancos, indústrias",
  },
  {
    value: "moderno",
    label: "Moderno",
    description: "Startups, scale-ups, empresas de tecnologia",
  },
  {
    value: "executivo",
    label: "Executivo",
    description: "Gerência, head, diretoria",
  },
  {
    value: "primeiro_emprego",
    label: "Primeiro emprego",
    description: "Estágio, júnior, transição de carreira",
  },
];

const LENGTH_OPTIONS: Array<{
  value: CoverLetterLengthMode;
  label: string;
  description: string;
}> = [
  {
    value: "curta",
    label: "Curta",
    description: "Para formulários (Gupy, Workday)",
  },
  {
    value: "media",
    label: "Média",
    description: "Para a maioria das candidaturas",
  },
  { value: "completa", label: "Completa", description: "Para PDF / e-mail" },
];

const STYLE_LABELS: Record<CoverLetterStyle, string> = {
  formal: "FORMAL",
  moderno: "MODERNO",
  executivo: "EXECUTIVO",
  primeiro_emprego: "PRIMEIRO EMPREGO",
};

const LENGTH_LABELS: Record<CoverLetterLengthMode, string> = {
  curta: "CURTA",
  media: "MÉDIA",
  completa: "COMPLETA",
  custom: "PERSONALIZADO",
};

function optionCardStyle(
  selected: boolean,
  muted: boolean,
): React.CSSProperties {
  if (muted) {
    return {
      border: "1px solid rgba(10,10,10,0.08)",
      borderRadius: 11,
      padding: "13px 15px",
      background: "#fff",
      cursor: "not-allowed",
      opacity: 0.45,
      textAlign: "left",
    };
  }
  return {
    border: selected ? "1px solid #0a0a0a" : "1px solid rgba(10,10,10,0.08)",
    borderRadius: 11,
    padding: "13px 15px",
    background: selected ? "#0a0a0a" : "#fff",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 140ms ease, background 140ms ease",
  };
}

export function CoverLetterPanel({
  open,
  onClose,
  applicationId,
  adaptationId,
  jobTitle,
  company,
  initialCoverLetter,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  adaptationId?: string;
  jobTitle: string;
  company: string;
  initialCoverLetter: CoverLetterDto | null;
  onGenerated?: () => void;
}) {
  const [letter, setLetter] = useState<CoverLetterDto | null>(
    initialCoverLetter,
  );
  const [style, setStyle] = useState<CoverLetterStyle>("formal");
  const [lengthMode, setLengthMode] = useState<CoverLetterLengthMode>("media");
  const [useCharLimit, setUseCharLimit] = useState(false);
  const [maxCharacters, setMaxCharacters] = useState("1500");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    initialCoverLetter?.status === "failed"
      ? (initialCoverLetter.lastError ?? null)
      : null,
  );
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "docx" | null>(
    null,
  );
  const pollInFlightRef = useRef(false);

  const [isRendered, setIsRendered] = useState(false);
  const [backdropReady, setBackdropReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (open) {
      const scrollW = window.innerWidth - document.documentElement.clientWidth;
      if (scrollW > 0) {
        document.body.style.paddingRight = `${scrollW}px`;
      }
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.scrollbarWidth = "none";
      setIsRendered(true);
      setBackdropReady(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    setBackdropReady(false);
    const t = setTimeout(() => {
      setIsRendered(false);
      document.documentElement.style.overflow = "";
      document.documentElement.style.scrollbarWidth = "";
      document.body.style.paddingRight = "";
    }, TRANSITION_MS);
    return () => {
      clearTimeout(t);
      document.documentElement.style.overflow = "";
      document.documentElement.style.scrollbarWidth = "";
      document.body.style.paddingRight = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function pollUntilDone(input: {
    style: CoverLetterStyle;
    lengthMode: CoverLetterLengthMode;
    maxCharacters?: number;
  }) {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    setPending(true);
    setError(null);
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    try {
      while (Date.now() < deadline) {
        const result = await generateOrGetCoverLetter(
          applicationId,
          {
            ...input,
            adaptationId,
          },
          getJourneySessionInternalId(),
        );

        if (result.status === "succeeded") {
          setLetter(result);
          onGenerated?.();
          return;
        }

        if (result.status === "failed") {
          setError(
            result.lastError ?? "Falha ao gerar a carta. Tente novamente.",
          );
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      setError(
        "A geração está demorando mais que o esperado. Tente novamente.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao gerar a carta. Tente novamente.",
      );
    } finally {
      pollInFlightRef.current = false;
      setPending(false);
    }
  }

  function handleGenerate() {
    const parsedMax = Number.parseInt(maxCharacters, 10);
    const validMax =
      useCharLimit && Number.isFinite(parsedMax) && parsedMax > 0
        ? parsedMax
        : undefined;
    const resolvedLengthMode = useCharLimit ? "custom" : lengthMode;

    void trackEvent({
      eventName: "cover_letter_generate_clicked",
      eventVersion: 1,
      properties: {
        style,
        length_mode: resolvedLengthMode,
        has_char_limit: useCharLimit,
        max_characters: validMax ?? null,
      },
    });

    void pollUntilDone({
      style,
      lengthMode: resolvedLengthMode,
      maxCharacters: validMax,
    });
  }

  // Retoma polling se a página foi recarregada no meio de uma geração.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot resume guarded by pollInFlightRef
  useEffect(() => {
    if (!open) return;
    if (
      initialCoverLetter?.status === "pending" ||
      initialCoverLetter?.status === "processing"
    ) {
      void pollUntilDone({
        style: initialCoverLetter.style,
        lengthMode: initialCoverLetter.lengthMode,
        maxCharacters: initialCoverLetter.maxCharacters ?? undefined,
      });
    }
  }, [open]);

  async function handleDownload(format: "pdf" | "docx") {
    setDownloadFormat(format);
    try {
      await downloadFromApi({
        url: `/api/job-applications/${applicationId}/cover-letter/download?format=${format}`,
        fallbackFilename: `carta-de-apresentacao.${format}`,
      });
    } catch {
      setError("Falha ao baixar a carta. Tente novamente.");
    } finally {
      setDownloadFormat(null);
    }
  }

  if (!isRendered) return null;

  const showResult =
    letter?.status === "succeeded" && letter.generatedContentJson;
  const showConfig = !showResult && !pending;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "rgba(10,10,10,0.46)",
          backdropFilter: backdropReady ? "blur(3px)" : "none",
          opacity: backdropReady ? 1 : 0,
          pointerEvents: backdropReady ? "auto" : "none",
          transition: backdropReady
            ? "none"
            : "opacity 200ms ease, backdrop-filter 200ms ease",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carta de apresentação"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 101,
          width: "min(660px, 94vw)",
          background: "#fafaf6",
          borderLeft: "1px solid rgba(10,10,10,0.10)",
          boxShadow: "-24px 0 60px -10px rgba(10,10,10,0.28)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "30px 34px 26px",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms cubic-bezier(0.22,1,0.36,1)",
          willChange: "transform",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
            marginBottom: 20,
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.1,
                fontWeight: 500,
                color: "#3a5008",
                background: "rgba(198,255,58,0.18)",
                border: "1px solid rgba(110,150,20,0.28)",
                borderRadius: 999,
                padding: showResult ? "4px 10px" : "4px 10px 4px 8px",
                marginBottom: 10,
              }}
            >
              {!showResult && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#557d0c",
                    boxShadow: "0 0 6px rgba(198,255,58,0.7)",
                  }}
                />
              )}
              {showResult ? "CARTA GERADA" : "CARTA COM IA · BASEADA NO SEU CV"}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 29,
                fontWeight: 500,
                letterSpacing: -1.1,
                lineHeight: 1.05,
                color: "#0a0a0a",
                fontFamily: GEIST,
                marginBottom: 7,
              }}
            >
              Carta de{" "}
              <em style={{ fontFamily: SERIF_ITALIC, fontStyle: "italic" }}>
                apresentação.
              </em>
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                color: "#5a5a55",
                lineHeight: 1.5,
                fontFamily: GEIST,
              }}
            >
              <b>
                {jobTitle} · {company}
              </b>
              {!showResult && " · gerada a partir do seu CV adaptado"}
            </p>
            {showResult && letter && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 12,
                }}
              >
                <CoverLetterChip
                  label={`ESTILO · ${STYLE_LABELS[letter.style]}`}
                />
                <CoverLetterChip
                  label={`COMPRIMENTO · ${LENGTH_LABELS[letter.lengthMode]}`}
                />
                <CoverLetterChip
                  label={`${letter.generatedContentJson?.characterCount ?? 0} CARACTERES`}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid rgba(10,10,10,0.10)",
              background: "transparent",
              cursor: "pointer",
              color: "#6a6560",
              flexShrink: 0,
            }}
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {pending && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: "48px 0",
            }}
          >
            <EcvBuildLoader size={56} />
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                color: "#0a0a0a",
                fontFamily: GEIST,
              }}
            >
              Gerando sua carta...
            </p>
          </div>
        )}

        {showConfig && (
          <>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.3,
                textTransform: "uppercase",
                color: "#8a8a85",
                marginBottom: 10,
              }}
            >
              Estilo
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {STYLE_OPTIONS.map((opt) => {
                const selected = style === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStyle(opt.value)}
                    style={optionCardStyle(selected, false)}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: -0.2,
                        color: selected ? "#fafaf6" : "#0a0a0a",
                        fontFamily: GEIST,
                      }}
                    >
                      {opt.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        marginTop: 3,
                        lineHeight: 1.4,
                        color: selected ? "#9a9a94" : "#8a8a85",
                        fontFamily: GEIST,
                      }}
                    >
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.3,
                textTransform: "uppercase",
                color: "#8a8a85",
                marginTop: 22,
                marginBottom: 10,
              }}
            >
              Comprimento
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
              }}
            >
              {LENGTH_OPTIONS.map((opt) => {
                const selected = lengthMode === opt.value && !useCharLimit;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={useCharLimit}
                    onClick={() => setLengthMode(opt.value)}
                    style={optionCardStyle(selected, useCharLimit)}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: -0.2,
                        color: selected ? "#fafaf6" : "#0a0a0a",
                        fontFamily: GEIST,
                      }}
                    >
                      {opt.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        marginTop: 3,
                        lineHeight: 1.4,
                        color: selected ? "#9a9a94" : "#8a8a85",
                        fontFamily: GEIST,
                      }}
                    >
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginTop: 20,
                fontSize: 13,
                color: "#2a2a28",
                fontFamily: GEIST,
              }}
            >
              <input
                type="checkbox"
                checked={useCharLimit}
                onChange={(e) => setUseCharLimit(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#0a0a0a" }}
              />
              Definir limite de caracteres (para formulários com contador)
            </label>

            {useCharLimit && (
              <input
                type="number"
                min={100}
                max={5000}
                value={maxCharacters}
                onChange={(e) => setMaxCharacters(e.target.value)}
                style={{
                  marginTop: 10,
                  width: 140,
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 8,
                  padding: "9px 12px",
                  fontFamily: MONO,
                  fontSize: 13,
                  color: "#0a0a0a",
                  background: "#fff",
                }}
              />
            )}

            {error && (
              <p
                style={{
                  margin: "18px 0 0",
                  fontSize: 12.5,
                  color: "#991b1b",
                  background: "#fee2e2",
                  padding: "8px 14px",
                  borderRadius: 8,
                }}
              >
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              style={{
                marginTop: 26,
                background: "#0a0a0a",
                color: "#fafaf6",
                border: "none",
                borderRadius: 11,
                padding: 14,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                width: "100%",
                fontFamily: GEIST,
                boxShadow: "0 8px 20px rgba(10,10,10,0.18)",
              }}
            >
              Gerar carta de apresentação →
            </button>

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 10,
                padding: "11px 14px",
                marginTop: 18,
              }}
            >
              <span
                style={{
                  width: 19,
                  height: 19,
                  borderRadius: "50%",
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontStyle: "italic",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                i
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "#5a5a55",
                  lineHeight: 1.5,
                  fontFamily: GEIST,
                }}
              >
                Usamos apenas o conteúdo do seu CV adaptado — nada é inventado.
                Revise o resultado antes de baixar.
              </span>
            </div>
          </>
        )}

        {showResult && letter?.generatedContentJson && (
          <>
            <div
              style={{
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 14,
                padding: "24px 26px",
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {letter.generatedContentJson.body
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter((paragraph) => paragraph.length > 0)
                .map((paragraph) => (
                  <p
                    key={paragraph}
                    style={{
                      fontSize: 13.5,
                      color: "#2a2a28",
                      lineHeight: 1.7,
                      margin: "0 0 14px",
                      fontFamily: GEIST,
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#8a8a85",
                  marginTop: "auto",
                  paddingTop: 14,
                }}
              >
                {letter.generatedAt
                  ? `gerado em ${new Date(letter.generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`
                  : ""}
              </div>
            </div>

            {error && (
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: 12.5,
                  color: "#991b1b",
                  background: "#fee2e2",
                  padding: "8px 14px",
                  borderRadius: 8,
                }}
              >
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 9, marginTop: 20 }}>
              <button
                type="button"
                disabled={downloadFormat !== null}
                onClick={() => handleDownload("docx")}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: 11,
                  borderRadius: 8,
                  border: "1px solid rgba(10,10,10,0.12)",
                  background: "#fff",
                  color: "#0a0a0a",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: downloadFormat !== null ? "not-allowed" : "pointer",
                  opacity: downloadFormat !== null ? 0.6 : 1,
                  fontFamily: GEIST,
                }}
              >
                {downloadFormat === "docx" ? "Baixando..." : "↓ Baixar DOCX"}
              </button>
              <button
                type="button"
                disabled={downloadFormat !== null}
                onClick={() => handleDownload("pdf")}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: 11,
                  borderRadius: 8,
                  border: "none",
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: downloadFormat !== null ? "not-allowed" : "pointer",
                  opacity: downloadFormat !== null ? 0.6 : 1,
                  fontFamily: GEIST,
                }}
              >
                {downloadFormat === "pdf" ? "Baixando..." : "↓ Baixar PDF"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function CoverLetterChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.10)",
        borderRadius: 999,
        padding: "4px 10px",
        fontFamily: MONO,
        fontSize: 10,
        color: "#3a3a36",
        letterSpacing: 0.3,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
