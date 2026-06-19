import Link from "next/link";

const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const QUESTIONS = [
  "Por que você quer trabalhar na Nubank?",
  "Como você aborda problemas de escala em React?",
  "Relate uma situação de conflito no time e como resolveu.",
];

const STRENGTHS = [
  "React · Node.js em produção",
  "Experiência com fintech",
];

const ALERTS = [
  "AWS pouco detalhado no CV",
  "CI/CD não mencionado",
];

export function InterviewPrepSection() {
  return (
    <section
      style={{
        background: "#fff",
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        borderTop: "1px solid rgba(10,10,10,0.06)",
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
        className="e-prep-grid"
      >
        {/* Left — text */}
        <div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1.5,
              color: "#6a6a66",
              fontWeight: 500,
              textTransform: "uppercase" as const,
              marginBottom: 20,
            }}
          >
            Preparação para entrevista
          </div>
          <h2
            style={{
              fontSize: "clamp(30px, 4.5vw, 46px)",
              fontWeight: 500,
              letterSpacing: -1.8,
              lineHeight: 1.05,
              margin: "0 0 22px",
              color: "#0a0a0a",
            }}
          >
            Prepare-se antes de{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
                display: "block",
                letterSpacing: -0.5,
              }}
            >
              entrar na sala.
            </em>
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: "#45443e",
              margin: "0 0 32px",
              maxWidth: 440,
            }}
          >
            Com base no CV adaptado, na descrição da vaga e em padrões comuns
            de entrevistas para posições semelhantes, o EarlyCV gera perguntas
            prováveis, destaca seus pontos fortes e mostra pontos de atenção
            antes da conversa.
          </p>

          <ul
            style={{
              listStyle: "none",
              margin: "0 0 36px",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {[
              "Perguntas prováveis geradas com base na vaga real",
              "Pontos fortes e alertas identificados no seu CV",
              "Cada entrevista te prepara melhor para a próxima",
            ].map((item) => (
              <li
                key={item}
                style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(198,255,58,0.22)",
                    border: "1px solid rgba(110,150,20,0.28)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    color: "#4a7008",
                    flexShrink: 0,
                    marginTop: 1,
                    fontWeight: 600,
                  }}
                >
                  ✓
                </span>
                <span
                  style={{
                    fontSize: 15,
                    color: "#2a2a28",
                    lineHeight: 1.45,
                    fontWeight: 450,
                  }}
                >
                  {item}
                </span>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <Link
              href="/candidaturas"
              style={{
                background: "#0a0a0a",
                color: "#fff",
                borderRadius: 10,
                padding: "14px 22px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                letterSpacing: -0.1,
                boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
                display: "inline-block",
              }}
            >
              Preparar entrevista →
            </Link>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: "#8a8a85",
                letterSpacing: 0.2,
              }}
            >
              disponível nos planos pagos
            </span>
          </div>
        </div>

        {/* Right — widget mockup */}
        <div className="e-prep-visual">
          <div
            style={{
              background: "#f5f5f2",
              borderRadius: 14,
              border: "1px solid rgba(10,10,10,0.08)",
              overflow: "hidden",
              boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
            }}
          >
            {/* Browser chrome */}
            <div
              style={{
                padding: "10px 14px",
                background: "#ececea",
                borderBottom: "1px solid rgba(10,10,10,0.08)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 5 }}>
                {["#ff6058", "#ffbd2e", "#28c840"].map((c) => (
                  <div
                    key={c}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: c,
                    }}
                  />
                ))}
              </div>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
                  flex: 1,
                  textAlign: "center",
                }}
              >
                prep.earlyCV
              </span>
            </div>

            {/* Content */}
            <div style={{ padding: "18px 18px 20px" }}>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#c6ff3a",
                    boxShadow: "0 0 5px #c6ff3a",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: 0.8,
                    color: "#3a3a38",
                    fontWeight: 500,
                  }}
                >
                  PREP · NUBANK – SENIOR DEV
                </span>
              </div>

              {/* EMPRESA */}
              <div
                style={{
                  background: "#fafaf6",
                  border: "1px solid rgba(10,10,10,0.07)",
                  borderRadius: 9,
                  padding: "10px 12px",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: 1,
                    color: "#8a8a85",
                    marginBottom: 5,
                  }}
                >
                  EMPRESA
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "#45443e",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Nubank tende a focar em cultura de dono e escalabilidade
                  técnica em processos para eng. sênior.
                </p>
              </div>

              {/* Perguntas prováveis */}
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: 0.8,
                  color: "#6a6a66",
                  marginBottom: 8,
                }}
              >
                Perguntas prováveis
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                {QUESTIONS.map((q, i) => (
                  <div
                    key={q}
                    style={{
                      background: "#fafaf6",
                      border: "1px solid rgba(10,10,10,0.07)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: "#b0aea8",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      0{i + 1}
                    </span>
                    <span
                      style={{ fontSize: 12.5, color: "#2a2a28", lineHeight: 1.4 }}
                    >
                      {q}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pontos fortes + Atenção */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <div
                  style={{
                    background: "rgba(198,255,58,0.12)",
                    border: "1px solid rgba(110,150,20,0.2)",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 8.5,
                      letterSpacing: 0.8,
                      color: "#4a7008",
                      marginBottom: 5,
                      fontWeight: 600,
                    }}
                  >
                    ↑ PONTOS FORTES
                  </div>
                  {STRENGTHS.map((s) => (
                    <div
                      key={s}
                      style={{
                        fontSize: 11,
                        color: "#2a4a08",
                        lineHeight: 1.5,
                      }}
                    >
                      · {s}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    background: "rgba(255,200,80,0.1)",
                    border: "1px solid rgba(180,130,20,0.2)",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 8.5,
                      letterSpacing: 0.8,
                      color: "#7a5008",
                      marginBottom: 5,
                      fontWeight: 600,
                    }}
                  >
                    △ ATENÇÃO
                  </div>
                  {ALERTS.map((a) => (
                    <div
                      key={a}
                      style={{
                        fontSize: 11,
                        color: "#5a3a08",
                        lineHeight: 1.5,
                      }}
                    >
                      · {a}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                style={{
                  width: "100%",
                  background: "#0a0a0a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 9,
                  padding: "11px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: -0.1,
                }}
              >
                Praticar perguntas →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
