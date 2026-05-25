"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import type { InterviewPrepContent, InterviewPrepDto } from "@/lib/job-applications-api";
import { generateOrGetInterviewPrep } from "@/lib/job-applications-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const CARD: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 12,
};

type Props = {
  applicationId: string;
  initialPrep: InterviewPrepDto | null;
  open: boolean;
  onClose: () => void;
};

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ ...CARD, padding: "14px 18px", marginBottom: 10 }}>
      <p
        style={{
          margin: "0 0 10px",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.9px",
          color: "#8a8a85",
          fontWeight: 500,
          textTransform: "uppercase",
        }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function StringList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            gap: 8,
            fontSize: 13.5,
            color: "#0a0a0a",
            lineHeight: 1.55,
          }}
        >
          <span style={{ color: "#c6ff3a", flexShrink: 0, marginTop: 2 }}>→</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function QuestionBlock({ q }: { q: InterviewPrepContent["questionsTheyMayAsk"][number] }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 9,
        background: "rgba(10,10,10,0.03)",
        border: "1px solid rgba(10,10,10,0.06)",
        marginBottom: 8,
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 13.5,
          fontWeight: 500,
          color: "#0a0a0a",
          lineHeight: 1.45,
        }}
      >
        {q.question}
      </p>
      <p
        style={{
          margin: "0 0 4px",
          fontSize: 12,
          color: "#6a6560",
          fontStyle: "italic",
        }}
      >
        {q.whyItMatters}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "#45443e",
          lineHeight: 1.55,
        }}
      >
        {q.answerDirection}
      </p>
    </div>
  );
}

function PrepContent({ prep }: { prep: InterviewPrepDto }) {
  const c = prep.generatedContentJson;
  return (
    <div>
      <SectionBlock title="Estratégia geral">
        <p style={{ margin: 0, fontSize: 13.5, color: "#0a0a0a", lineHeight: 1.65 }}>
          {c.strategySummary}
        </p>
      </SectionBlock>

      {c.strengthsToHighlight.length > 0 && (
        <SectionBlock title="Pontos fortes para destacar">
          <StringList items={c.strengthsToHighlight} />
        </SectionBlock>
      )}

      {c.likelyRisksOrGaps.length > 0 && (
        <SectionBlock title="Riscos ou gaps prováveis">
          <StringList items={c.likelyRisksOrGaps} />
        </SectionBlock>
      )}

      {c.questionsTheyMayAsk.length > 0 && (
        <SectionBlock title="Perguntas que podem fazer">
          {c.questionsTheyMayAsk.map((q, i) => (
            <QuestionBlock key={i} q={q} />
          ))}
        </SectionBlock>
      )}

      {c.questionsCandidateShouldAsk.length > 0 && (
        <SectionBlock title="Perguntas para fazer à empresa">
          <StringList items={c.questionsCandidateShouldAsk} />
        </SectionBlock>
      )}

      {c.recommendedPosture.length > 0 && (
        <SectionBlock title="Postura recomendada">
          <StringList items={c.recommendedPosture} />
        </SectionBlock>
      )}

      {c.finalChecklist.length > 0 && (
        <SectionBlock title="Checklist final">
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {c.finalChecklist.map((item, i) => (
              <li
                key={i}
                style={{ display: "flex", gap: 8, fontSize: 13.5, color: "#0a0a0a", lineHeight: 1.55 }}
              >
                <span style={{ color: "#405410", flexShrink: 0 }}>☑</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SectionBlock>
      )}

      <p
        style={{
          margin: "16px 0 0",
          fontFamily: MONO,
          fontSize: 10,
          color: "#8a8a85",
          letterSpacing: "0.5px",
          textAlign: "center",
        }}
      >
        Gerado em{" "}
        {new Date(prep.generatedAt).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

export function InterviewPrepDrawer({
  applicationId,
  initialPrep,
  open,
  onClose,
}: Props) {
  const [prep, setPrep] = useState<InterviewPrepDto | null>(initialPrep);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateOrGetInterviewPrep(applicationId);
        setPrep(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Falha ao gerar preparação. Tente novamente.",
        );
      }
    });
  }

  if (!open) return null;

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
          background: "rgba(10,10,10,0.45)",
          backdropFilter: "blur(4px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Preparação para entrevista"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 101,
          width: "min(520px, 96vw)",
          background: "#f4f3ed",
          borderLeft: "1px solid rgba(10,10,10,0.10)",
          boxShadow: "-8px 0 40px -10px rgba(10,10,10,0.20)",
          display: "flex",
          flexDirection: "column",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(10,10,10,0.08)",
            flexShrink: 0,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 500,
                color: "#0a0a0a",
                fontFamily: GEIST,
              }}
            >
              Preparação para entrevista
            </p>
            {prep && (
              <p
                style={{
                  margin: "2px 0 0",
                  fontFamily: MONO,
                  fontSize: 10,
                  color: "#8a8a85",
                  letterSpacing: "0.5px",
                }}
              >
                Briefing gerado
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar preparação"
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
            }}
          >
            <svg
              aria-hidden
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

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {prep ? (
            <PrepContent prep={prep} />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                padding: "48px 24px",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "rgba(10,10,10,0.06)",
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
                  stroke="#8a8a85"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>

              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    fontFamily: GEIST,
                  }}
                >
                  Gerar preparação para entrevista
                </p>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 13.5,
                    color: "#6a6560",
                    lineHeight: 1.6,
                    maxWidth: 340,
                    fontFamily: GEIST,
                  }}
                >
                  Usamos os dados da sua candidatura e análise de CV para gerar
                  um briefing prático: pontos fortes, gaps, perguntas prováveis
                  e checklist final.
                </p>
              </div>

              {error && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: "#991b1b",
                    background: "#fee2e2",
                    padding: "8px 14px",
                    borderRadius: 8,
                    maxWidth: 340,
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={pending}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 22px",
                  borderRadius: 10,
                  border: "none",
                  background: pending ? "rgba(10,10,10,0.12)" : "#0a0a0a",
                  color: pending ? "#8a8a85" : "#fafaf6",
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: pending ? "not-allowed" : "pointer",
                  fontFamily: GEIST,
                  transition: "all 140ms ease",
                }}
              >
                {pending ? (
                  <>
                    <svg
                      aria-hidden
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      style={{ animation: "spin 1s linear infinite" }}
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Gerando…
                  </>
                ) : (
                  "Gerar preparação"
                )}
              </button>

              <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
              `}</style>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
