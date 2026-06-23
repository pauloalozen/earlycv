"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { trackEvent } from "@/lib/analytics-tracking";
import type { InterviewPrepDto } from "@/lib/job-applications-api";
import { generateOrGetInterviewPrep } from "@/lib/job-applications-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

type Props = {
  applicationId: string;
  initialPrep: InterviewPrepDto | null;
  open: boolean;
  onClose: () => void;
  onGenerated?: () => void;
  jobTitle: string;
  company: string;
  scoreAfter?: number | null;
  nextActionAt?: string | null;
  adaptationId?: string;
};

function PrepChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.10)",
        borderRadius: 999,
        padding: "4px 9px",
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

function PrepSection({
  n,
  title,
  tone,
  children,
}: {
  n: string;
  title: string;
  tone?: "green" | "yellow" | "blue";
  children: React.ReactNode;
}) {
  const accent =
    tone === "green"
      ? {
          color: "#3a5008",
          border: "1px solid rgba(110,150,20,0.22)",
          bg: "rgba(198,255,58,0.06)",
        }
      : tone === "yellow"
        ? {
            color: "#7a5a04",
            border: "1px solid rgba(180,140,10,0.22)",
            bg: "rgba(245,197,24,0.06)",
          }
        : tone === "blue"
          ? {
              color: "#1a3a7a",
              border: "1px solid rgba(60,100,220,0.20)",
              bg: "rgba(60,100,220,0.04)",
            }
          : {
              color: "#0a0a0a",
              border: "1px solid rgba(10,10,10,0.08)",
              bg: "#fafaf6",
            };
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: "#8a8a85",
            fontWeight: 500,
          }}
        >
          {n}
        </span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: -0.4,
            color: accent.color,
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          background: accent.bg,
          border: accent.border,
          borderRadius: 14,
          padding: "18px 22px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PrepBullet({
  kicker,
  body,
  last,
}: {
  kicker: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: last ? "none" : "1px dashed rgba(10,10,10,0.08)",
      }}
    >
      <div
        style={{
          marginBottom: 3,
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: 1,
          color: "#8a8a85",
          fontWeight: 500,
        }}
      >
        {kicker}
      </div>
      <div style={{ fontSize: 13, color: "#3a3a36", lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  );
}

function PrepQA({
  q,
  why,
  direction,
  last,
}: {
  q: string;
  why: string;
  direction: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 0",
        borderBottom: last ? "none" : "1px dashed rgba(10,10,10,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#0a0a0a",
          marginBottom: why ? 5 : 7,
          letterSpacing: -0.2,
          display: "flex",
          gap: 8,
        }}
      >
        <span style={{ color: "#8a8a85", flexShrink: 0 }}>›</span>
        <span>{q}</span>
      </div>
      {why && (
        <div
          style={{
            fontSize: 12,
            color: "#6a6560",
            fontStyle: "italic",
            marginBottom: 7,
            paddingLeft: 16,
            lineHeight: 1.5,
          }}
        >
          {why}
        </div>
      )}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.06)",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: 1,
            color: "#7aa811",
            fontWeight: 500,
            marginRight: 8,
          }}
        >
          LINHA
        </span>
        <span style={{ fontSize: 12.5, color: "#3a3a36", lineHeight: 1.55 }}>
          {direction}
        </span>
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
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
      {items.map((item) => (
        <li
          key={item}
          style={{
            fontSize: 13.5,
            color: "#2a2a28",
            lineHeight: 1.55,
            paddingLeft: 14,
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 9,
              width: 6,
              height: 1,
              background: "rgba(10,10,10,0.3)",
            }}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

function PrepContent({
  prep,
  jobTitle,
  company,
  scoreAfter,
  nextActionAt,
  onClose,
}: {
  prep: InterviewPrepDto;
  jobTitle: string;
  company: string;
  scoreAfter?: number | null;
  nextActionAt?: string | null;
  onClose: () => void;
}) {
  const c = prep.generatedContentJson;

  const chips = [
    "Vaga + JD",
    "Análise",
    ...(scoreAfter != null ? [`CV adaptado (score ${scoreAfter}%)`] : []),
    ...(c.likelyRisksOrGaps.length > 0
      ? [`Gaps (${c.likelyRisksOrGaps.length})`]
      : []),
  ];

  let sectionN = 0;
  const nextN = () => {
    sectionN += 1;
    return String(sectionN).padStart(2, "0");
  };

  return (
    <div>
      {/* Rich header */}
      <div
        className="prep-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 20,
          paddingBottom: 20,
          borderBottom: "1px solid rgba(10,10,10,0.07)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {/* Kicker */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1.2,
              color: "#3a5008",
              fontWeight: 500,
              marginBottom: 10,
              background: "rgba(198,255,58,0.18)",
              padding: "4px 9px 4px 8px",
              borderRadius: 999,
              border: "1px solid rgba(110,150,20,0.22)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#7aa811",
                boxShadow: "0 0 6px rgba(198,255,58,0.7)",
                flexShrink: 0,
              }}
            />
            PREPARAÇÃO COM IA · BASEADA NO SEU CV
          </div>

          {/* H1 */}
          <div
            style={{
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: -1.1,
              lineHeight: 1.05,
              marginBottom: 9,
              fontFamily: GEIST,
            }}
          >
            Preparar{" "}
            <em
              style={{
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              entrevista.
            </em>
          </div>

          {/* Sub */}
          <div
            style={{
              fontSize: 13.5,
              color: "#5a5a55",
              lineHeight: 1.5,
              marginBottom: 12,
              fontFamily: GEIST,
            }}
          >
            <strong style={{ color: "#0a0a0a" }}>
              {jobTitle} · {company}
            </strong>
            {nextActionAt &&
              (() => {
                const d = new Date(nextActionAt);
                const date = d.toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                });
                const time = d.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return ` · ${date} · ${time}`;
              })()}
          </div>

          {/* Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {chips.map((chip) => (
              <PrepChip key={chip} label={chip} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div
          className="prep-header-actions"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => {
              void trackEvent({
                eventName: "interview_prep_printed",
                eventVersion: 1,
              });
              const sections: { title: string; content: string }[] = [
                { title: "Estratégia", content: `<p>${c.strategySummary}</p>` },
              ];
              if (c.strengthsToHighlight.length)
                sections.push({
                  title: "Pontos Fortes",
                  content: `<ul>${c.strengthsToHighlight.map((s) => `<li>${s}</li>`).join("")}</ul>`,
                });
              if (c.likelyRisksOrGaps.length)
                sections.push({
                  title: "Riscos / Gaps",
                  content: `<ul>${c.likelyRisksOrGaps.map((s) => `<li>${s}</li>`).join("")}</ul>`,
                });
              if (c.questionsTheyMayAsk.length)
                sections.push({
                  title: "Perguntas Prováveis",
                  content: `<ol>${c.questionsTheyMayAsk.map((q) => `<li><strong>${q.question}</strong><br/><em>${q.answerDirection}</em></li>`).join("")}</ol>`,
                });
              if (c.questionsCandidateShouldAsk.length)
                sections.push({
                  title: "Perguntas para Fazer",
                  content: `<ul>${c.questionsCandidateShouldAsk.map((s) => `<li>${s}</li>`).join("")}</ul>`,
                });
              if (c.finalChecklist.length)
                sections.push({
                  title: "Checklist Final",
                  content: `<ul>${c.finalChecklist.map((s) => `<li>☐ ${s}</li>`).join("")}</ul>`,
                });
              const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preparação — ${jobTitle} @ ${company}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;color:#111;line-height:1.6}h1{font-size:1.2rem;margin-bottom:4px}h2{font-size:1rem;margin-top:24px;margin-bottom:8px;border-bottom:1px solid #e5e5e5;padding-bottom:4px}p,li{font-size:.875rem}ul,ol{padding-left:20px}@media print{body{margin:20px}}</style></head><body><h1>${jobTitle} — ${company}</h1><p style="color:#666;font-size:.8rem">Preparação para Entrevista</p>${sections.map((s) => `<h2>${s.title}</h2>${s.content}`).join("")}</body></html>`;
              const win = window.open("", "_blank", "width=800,height=900");
              if (win) {
                win.document.write(html);
                win.document.close();
                win.focus();
                win.print();
              }
            }}
            style={{
              background: "#fff",
              color: "#0a0a0a",
              border: "1px solid rgba(10,10,10,0.15)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: GEIST,
            }}
          >
            Exportar PDF
          </button>
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
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Safety notice */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.08)",
          borderRadius: 10,
          padding: "11px 14px",
          marginBottom: 26,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#0a0a0a",
            color: "#fafaf6",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 600,
            fontStyle: "italic",
            flexShrink: 0,
          }}
        >
          i
        </div>
        <div style={{ fontSize: 12.5, color: "#5a5a55", lineHeight: 1.5 }}>
          Não inventamos experiências. Linhas de resposta são sugestões baseadas
          em pontos reais do seu CV — adapte ao tom da entrevista.
        </div>
      </div>

      {/* 01 · Estratégia */}
      {c.strategySummary && c.strategySummary.trim().length > 0 && (
        <PrepSection n={nextN()} title="Estratégia">
          <div style={{ fontSize: 14, color: "#2a2a28", lineHeight: 1.65 }}>
            {c.strategySummary}
          </div>
        </PrepSection>
      )}

      {/* 02 · Lições de processos anteriores */}
      {c.lessonsFromPastProcesses && (
        <PrepSection
          n={nextN()}
          title="O que seus processos anteriores revelam"
          tone="blue"
        >
          {(() => {
            const watchOuts = c.lessonsFromPastProcesses?.watchOuts ?? [];
            return (
              <>
          <div
            style={{
              fontSize: 14,
              color: "#1a2a5a",
              lineHeight: 1.65,
              marginBottom: watchOuts.length > 0 ? 14 : 0,
            }}
          >
            {c.lessonsFromPastProcesses.keyInsight}
          </div>
          {watchOuts.length > 0 && (
            <div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: 0.8,
                  color: "#3a5098",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Pontos de atenção
              </div>
              {watchOuts.map((item, i) => (
                <PrepBullet
                  key={item}
                  kicker="ATENÇÃO"
                  body={item}
                  last={i === watchOuts.length - 1}
                />
              ))}
            </div>
          )}
              </>
            );
          })()}
        </PrepSection>
      )}

      {/* 03 · Pontos fortes */}
      {c.strengthsToHighlight.length > 0 && (
        <PrepSection
          n={nextN()}
          title="Pontos fortes para destacar"
          tone="green"
        >
          {c.strengthsToHighlight.map((item, i) => (
            <PrepBullet
              key={item}
              kicker="PONTO"
              body={item}
              last={i === c.strengthsToHighlight.length - 1}
            />
          ))}
        </PrepSection>
      )}

      {/* 03 · Riscos / gaps */}
      {c.likelyRisksOrGaps.length > 0 && (
        <PrepSection n={nextN()} title="Riscos / gaps prováveis" tone="yellow">
          {c.likelyRisksOrGaps.map((item, i) => (
            <PrepBullet
              key={item}
              kicker="GAP"
              body={item}
              last={i === c.likelyRisksOrGaps.length - 1}
            />
          ))}
        </PrepSection>
      )}

      {/* 04 · Perguntas que podem fazer */}
      {c.questionsTheyMayAsk.length > 0 && (
        <PrepSection n={nextN()} title="Perguntas que podem te fazer">
          {c.questionsTheyMayAsk.map((q, i) => (
            <PrepQA
              key={q.question}
              q={q.question}
              why={q.whyItMatters}
              direction={q.answerDirection}
              last={i === c.questionsTheyMayAsk.length - 1}
            />
          ))}
        </PrepSection>
      )}

      {/* 05 · Perguntas para você fazer */}
      {c.questionsCandidateShouldAsk.length > 0 && (
        <PrepSection n={nextN()} title="Perguntas que você pode fazer">
          <BulletList items={c.questionsCandidateShouldAsk} />
        </PrepSection>
      )}

      {/* 06 · Postura recomendada */}
      {c.recommendedPosture.length > 0 && (
        <PrepSection n={nextN()} title="Postura recomendada">
          <BulletList items={c.recommendedPosture} />
        </PrepSection>
      )}

      {/* 07 · Checklist final */}
      {c.finalChecklist.length > 0 && (
        <PrepSection n={nextN()} title="Checklist final">
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {c.finalChecklist.map((item) => (
              <li
                key={item}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 13.5,
                  color: "#0a0a0a",
                  lineHeight: 1.55,
                }}
              >
                <span style={{ color: "#405410", flexShrink: 0 }}>☑</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </PrepSection>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 16,
          borderTop: "1px solid rgba(10,10,10,0.08)",
          marginTop: 8,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: "#8a8a85",
            letterSpacing: 0.3,
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
        </div>
        <div />
      </div>
    </div>
  );
}

export function InterviewPrepDrawer({
  applicationId,
  initialPrep,
  open,
  onClose,
  onGenerated,
  jobTitle,
  company,
  scoreAfter,
  nextActionAt,
  adaptationId,
}: Props) {
  const TRANSITION_MS = 280;

  const [prep, setPrep] = useState<InterviewPrepDto | null>(initialPrep);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (open) {
      const scrollW = window.innerWidth - document.documentElement.clientWidth;
      if (scrollW > 0) {
        document.body.style.paddingRight = `${scrollW}px`;
      }
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.scrollbarWidth = "none";
      setIsRendered(true);
      setVisible(true);
      return;
    }
    setVisible(false);
    setError(null);
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
    const hasExistingPrep = initialPrep !== null;
    void trackEvent({
      eventName: "interview_prep_drawer_opened",
      eventVersion: 1,
      properties: { has_existing_prep: hasExistingPrep },
    });
    if (hasExistingPrep) {
      void trackEvent({ eventName: "interview_prep_viewed", eventVersion: 1 });
    }
  }, [open, initialPrep]);

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
        const result = await generateOrGetInterviewPrep(applicationId, adaptationId);
        setPrep(result);
        onGenerated?.();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Falha ao gerar preparação. Tente novamente.",
        );
      }
    });
  }

  if (!isRendered) return null;

  return (
    <>
      <style>{`
        @keyframes prep-slide-in {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes prep-slide-out {
          from { transform: translateX(0); }
          to   { transform: translateX(100%); }
        }
        @media (max-width: 767px) {
          .prep-header { flex-direction: column !important; gap: 12px !important; }
          .prep-header-actions { flex-shrink: unset !important; align-self: flex-end !important; }
        }
      `}</style>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "rgba(10,10,10,0.45)",
          backdropFilter: visible ? "blur(3px)" : "none",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 200ms ease, backdrop-filter 200ms ease",
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
          width: "min(780px, 96vw)",
          background: "#fafaf6",
          borderLeft: "1px solid rgba(10,10,10,0.10)",
          boxShadow: "-24px 0 60px -10px rgba(10,10,10,0.28)",
          display: "flex",
          flexDirection: "column",
          animation: visible
            ? "prep-slide-in 280ms cubic-bezier(0.22,1,0.36,1) both"
            : "prep-slide-out 280ms cubic-bezier(0.22,1,0.36,1) forwards",
        }}
      >
        {prep ? (
          /* Filled state — rich content with header embedded */
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "28px 32px 32px",
            }}
          >
            <PrepContent
              prep={prep}
              jobTitle={jobTitle}
              company={company}
              scoreAfter={scoreAfter}
              nextActionAt={nextActionAt}
              onClose={onClose}
            />
          </div>
        ) : (
          <>
            {/* Minimal header for empty state */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 24px",
                borderBottom: "1px solid rgba(10,10,10,0.08)",
                flexShrink: 0,
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: 1.2,
                    color: "#8a8a85",
                    fontWeight: 500,
                  }}
                >
                  PREPARAÇÃO COM IA
                </p>
                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    fontFamily: GEIST,
                  }}
                >
                  {jobTitle} · {company}
                </p>
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

            {/* Empty state body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "0 32px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 460,
                  textAlign: "center",
                  padding: "48px 0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 20,
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "rgba(198,255,58,0.14)",
                    border: "1px solid rgba(110,150,20,0.22)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#7aa811"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>

                {/* Kicker */}
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    color: "#8a8a85",
                    fontWeight: 500,
                  }}
                >
                  6 SEÇÕES · BASEADO EM VAGA + CV + ANÁLISE
                </div>

                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 500,
                      letterSpacing: -0.6,
                      color: "#0a0a0a",
                      fontFamily: GEIST,
                      lineHeight: 1.2,
                    }}
                  >
                    Gerar preparação para entrevista
                  </p>
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 13.5,
                      color: "#6a6560",
                      lineHeight: 1.65,
                      fontFamily: GEIST,
                    }}
                  >
                    Estratégia, pontos fortes, gaps prováveis, perguntas com
                    linhas de resposta e checklist final — baseado nos dados
                    reais da sua candidatura.
                  </p>
                </div>

                {/* Safety note */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 9,
                    background: "#fff",
                    border: "1px solid rgba(10,10,10,0.08)",
                    borderRadius: 10,
                    padding: "10px 13px",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#0a0a0a",
                      color: "#fafaf6",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 600,
                      fontStyle: "italic",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    i
                  </div>
                  <div
                    style={{ fontSize: 12, color: "#5a5a55", lineHeight: 1.5 }}
                  >
                    Não inventamos experiências. Linhas de resposta são
                    sugestões baseadas em pontos reais do seu CV.
                  </div>
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
                      width: "100%",
                      boxSizing: "border-box",
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
                    padding: "12px 28px",
                    borderRadius: 10,
                    border: "none",
                    background: pending ? "rgba(10,10,10,0.12)" : "#0a0a0a",
                    color: pending ? "#8a8a85" : "#fafaf6",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: pending ? "not-allowed" : "pointer",
                    fontFamily: GEIST,
                    transition: "all 140ms ease",
                    boxShadow: pending ? "none" : "0 4px 14px rgba(0,0,0,0.14)",
                  }}
                >
                  {pending ? (
                    <>
                      <svg
                        aria-hidden="true"
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
                    "Gerar preparação →"
                  )}
                </button>

                <style>{`
                  @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
