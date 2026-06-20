"use client";

import { useEffect, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const pillars = [
  {
    icon: "⊞",
    title: "Organizado pelo fluxo",
    body: "Cada candidatura nasce quando você adapta o CV. Status, CV usado e histórico ficam registrados automaticamente — sem planilha.",
  },
  {
    icon: "◎",
    title: "Preparação integrada",
    body: "Avance de candidatura para prep de entrevista com um clique. Tudo baseado no CV que você usou e na vaga real.",
  },
  {
    icon: "↑",
    title: "Aprenda com cada processo",
    body: "Registre feedbacks, motivos de recusa e observações das entrevistas para ajustar melhor as próximas candidaturas.",
  },
];

const steps = [
  { label: "Vaga analisada", mono: "01" },
  { label: "CV adaptado", mono: "02" },
  { label: "Em entrevista", mono: "03" },
];

const rows = [
  {
    id: "cmp-001",
    title: "Senior Frontend Dev",
    company: "Nubank",
    status: "Em entrevista",
    score: 92,
    cta: "Preparar entrevista",
    green: true,
    step: 2,
  },
  {
    id: "cmp-002",
    title: "Product Designer",
    company: "iFood",
    status: "Aguardando retorno",
    score: 87,
    cta: "Ver detalhes",
    green: false,
    step: 1,
  },
  {
    id: "cmp-003",
    title: "Full Stack Engineer",
    company: "Stone",
    status: "Vaga analisada",
    score: null,
    cta: "Adaptar CV",
    green: false,
    step: 0,
  },
];

export function CandidaturasSection() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActiveStep((s) => (s + 1) % 3), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <>
    <section
      id="candidaturas"
      style={{
        background: "#f9f9f7",
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        borderTop: "1px solid rgba(10,10,10,0.06)",
        scrollMarginTop: 64,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "80px 40px",
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 80,
          alignItems: "center",
        }}
        className="e-candidaturas-grid"
      >
        {/* RIGHT visual — shown first on desktop via order */}
        <div style={{ order: 1 }} className="e-candidaturas-visual">
          <div
            style={{
              display: "flex",
              marginBottom: 16,
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 10,
              overflow: "hidden",
              background: "#f9f9f7",
            }}
          >
            {steps.map((st, i) => (
              <button
                key={st.mono}
                type="button"
                onClick={() => setActiveStep(i)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  background: activeStep === i ? "#0a0a0a" : "transparent",
                  border: "none",
                  borderRight: i < 2 ? "1px solid rgba(10,10,10,0.08)" : "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 300ms",
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: 0.8,
                    color: activeStep === i ? "#c6ff3a" : "#8a8a85",
                    fontWeight: 500,
                    marginBottom: 2,
                  }}
                >
                  {st.mono}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: activeStep === i ? "#fff" : "#3a3a36",
                    letterSpacing: -0.1,
                    textAlign: "left",
                  }}
                >
                  {st.label}
                </div>
              </button>
            ))}
          </div>

          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 4px 32px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid rgba(10,10,10,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f5f5f2",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  letterSpacing: 1,
                  color: "#5a5a55",
                  fontWeight: 500,
                }}
              >
                MINHAS CANDIDATURAS
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: "#8a8a85",
                }}
              >
                3 vagas · 1 em processo
              </span>
            </div>
            {rows.map((row) => {
              const isActive = row.step === activeStep;
              return (
                <div
                  key={row.id}
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid rgba(10,10,10,0.05)",
                    background: isActive
                      ? "rgba(198,255,58,0.06)"
                      : "transparent",
                    borderLeft: `3px solid ${isActive ? "#c6ff3a" : "transparent"}`,
                    transition: "all 400ms ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: "#0a0a0a",
                          letterSpacing: -0.2,
                          marginBottom: 3,
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6a6a66",
                          marginBottom: 8,
                        }}
                      >
                        {row.company}
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          background:
                            isActive && row.step === 2
                              ? "rgba(198,255,58,0.18)"
                              : "rgba(10,10,10,0.05)",
                          borderRadius: 999,
                          padding: "3px 9px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color:
                              isActive && row.step === 2
                                ? "#3a5008"
                                : "#5a5a55",
                            fontWeight: 500,
                          }}
                        >
                          {row.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {row.score != null ? (
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 500,
                            letterSpacing: -1,
                            color: "#2a6a10",
                            lineHeight: 1,
                          }}
                        >
                          {row.score}
                          <span style={{ fontSize: 13 }}>%</span>
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 300,
                            color: "#c0beb4",
                            lineHeight: 1,
                          }}
                        >
                          —
                        </div>
                      )}
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9.5,
                          color: "#8a8a85",
                          marginTop: 2,
                          marginBottom: 8,
                        }}
                      >
                        ATS score
                      </div>
                      <button
                        type="button"
                        style={{
                          background: row.green
                            ? "#c6ff3a"
                            : isActive
                              ? "#0a0a0a"
                              : "#ececea",
                          color: row.green
                            ? "#0a0a0a"
                            : isActive
                              ? "#fff"
                              : "#5a5a55",
                          border: "none",
                          borderRadius: 7,
                          padding: "6px 10px",
                          fontSize: 11.5,
                          fontWeight: 500,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "all 400ms",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.cta}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* LEFT text */}
        <div style={{ order: 2 }} className="e-candidaturas-text">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#c6ff3a",
              borderRadius: 999,
              padding: "5px 13px",
              marginBottom: 24,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#0a0a0a",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1,
                fontWeight: 600,
                color: "#0a0a0a",
              }}
            >
              NOVO NO EARLYCV
            </span>
          </div>
          <h2
            style={{
              fontSize: "clamp(32px, 4vw, 46px)",
              fontWeight: 500,
              letterSpacing: -1.9,
              lineHeight: 1.05,
              margin: "0 0 20px",
              color: "#0a0a0a",
            }}
          >
            Acompanhe cada candidatura{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              em um só lugar.
            </em>
          </h2>
          <p
            style={{
              fontSize: 16.5,
              lineHeight: 1.6,
              color: "#45443e",
              margin: "0 0 38px",
              maxWidth: 450,
            }}
          >
            Cada candidatura nasce do fluxo: adapte o CV, salve a candidatura e
            acompanhe o status — tudo em sequência, sem planilha e sem
            improviso.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              marginBottom: 40,
            }}
          >
            {pillars.map((p) => (
              <div
                key={p.title}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#f9f9f7",
                    border: "1px solid rgba(10,10,10,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    flexShrink: 0,
                    color: "#2a2a28",
                  }}
                >
                  {p.icon}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#0a0a0a",
                      marginBottom: 3,
                      letterSpacing: -0.2,
                    }}
                  >
                    {p.title}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "#5a5a55",
                      lineHeight: 1.5,
                    }}
                  >
                    {p.body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <a
            href="/candidaturas"
            className="e-candidaturas-cta"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              padding: "14px 22px",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: -0.1,
              boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
            }}
          >
            Começar a acompanhar →
          </a>
        </div>

        {/* Mobile-only CTA — below the visual (order: 3) */}
        <div className="e-candidaturas-cta-mobile" style={{ order: 3, display: "none", justifyContent: "center" }}>
          <a
            href="/candidaturas"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              padding: "14px 22px",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: -0.1,
              boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
            }}
          >
            Começar a acompanhar →
          </a>
        </div>
      </div>
    </section>

    <style>{`
      @media (max-width: 768px) {
        .e-candidaturas-cta { display: none !important; }
        .e-candidaturas-cta-mobile { display: flex !important; }
      }
    `}</style>
    </>
  );
}
