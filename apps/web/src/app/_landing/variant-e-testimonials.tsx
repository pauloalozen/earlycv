"use client";

import { useEffect, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const DATA = [
  {
    q: "Eu achava que meu currículo estava condizente com a vaga, mas a análise encontrou sugestões que eu não tinha percebido.",
    name: "Em busca de recolocação",
    av: "RC",
  },
  {
    q: "Achei a plataforma simples de usar. No final, já saí com o currículo pronto para me candidatar.",
    name: "Em transição de carreira",
    av: "TC",
  },
  {
    q: "Achava que meu currículo estava ótimo. Saí com uma lista de pontos que eu nunca teria percebido sozinha.",
    name: "Tecnologia · recolocação",
    av: "AP",
  },
  {
    q: "É muito mais prático do que tentar adaptar tudo manualmente para cada vaga.",
    name: "Usuária EarlyCV",
    av: "MV",
  },
  {
    q: "Já tinha tentado com outras ferramentas de IA. O EarlyCV encontrou pontos que elas não tinham identificado.",
    name: "Comparou ferramentas",
    av: "JL",
  },
  {
    q: "Não é um retorno genérico. Cada ponto era específico para a vaga que eu tinha escolhido.",
    name: "Testou a ferramenta",
    av: "DF",
  },
];

const INTERVAL = 5200;

function Star({ size, fill }: { size: number; fill: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "block", fill }}
      aria-hidden="true"
    >
      <title>Estrela</title>
      <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.785 1.401 8.169L12 18.896l-7.335 3.868 1.401-8.169L.132 9.21l8.2-1.192z" />
    </svg>
  );
}

export function DepoimentosSection() {
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => go((idx + 1) % DATA.length), INTERVAL);
    return () => clearTimeout(t);
  });

  function go(i: number) {
    setLeaving(true);
    setTimeout(() => {
      setIdx(i);
      setLeaving(false);
    }, 300);
  }

  const d = DATA[idx];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pause-on-hover for animated carousel
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background:
          "radial-gradient(ellipse 90% 70% at 50% 0%, #f9f8f4 0%, #eeede7 100%)",
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
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: 52,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
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
              padding: "6px 11px",
              borderRadius: 999,
              marginBottom: 24,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#c6ff3a",
                boxShadow: "0 0 6px #c6ff3a",
              }}
            />
            Feedbacks reais · anonimizados
          </div>
          <h2
            style={{
              fontSize: "clamp(26px, 4.5vw, 44px)",
              fontWeight: 500,
              letterSpacing: -1.8,
              lineHeight: 1.1,
              color: "#0a0a0a",
              margin: "0 0 16px",
              textWrap: "balance",
            }}
          >
            O currículo não estava ruim.
            <br />
            Estava{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              desalinhado
            </em>{" "}
            para a vaga.
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "#5a5a55",
              lineHeight: 1.6,
              margin: "0 auto 12px",
              maxWidth: 560,
            }}
          >
            Esses são feedbacks reais de quem usou. Nenhum dado pessoal foi
            exibido.
          </p>
          <p
            style={{
              fontSize: 15,
              color: "#7a7a74",
              lineHeight: 1.6,
              margin: "0 auto",
              maxWidth: 560,
            }}
          >
            Além do CV adaptado, o EarlyCV agora ajuda você a acompanhar
            candidaturas e se preparar para entrevistas.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.32fr 1fr",
            gap: 16,
            alignItems: "stretch",
          }}
          className="e-depoimentos-grid"
        >
          {/* Spotlight escuro rotativo */}
          <article
            style={{
              background: "#0a0a0a",
              borderRadius: 18,
              padding: "40px 40px 30px",
              boxShadow: "0 30px 64px -26px rgba(10,10,10,0.46)",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 360,
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -90,
                top: -90,
                width: 300,
                height: 300,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(198,255,58,0.16) 0%, rgba(198,255,58,0) 70%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 22,
                position: "relative",
                zIndex: 1,
              }}
            >
              <span style={{ display: "inline-flex", gap: 4 }}>
                {[...Array(5)].map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static stars
                  <Star key={i} size={15} fill="#c6ff3a" />
                ))}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: 1,
                  color: "#6f6f68",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <b style={{ color: "#c6ff3a", fontWeight: 500 }}>
                  {String(idx + 1).padStart(2, "0")}
                </b>{" "}
                / {String(DATA.length).padStart(2, "0")}
              </span>
            </div>
            <div
              style={{
                position: "relative",
                zIndex: 1,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                opacity: leaving ? 0 : 1,
                transform: leaving ? "translateY(-12px)" : "none",
                transition:
                  "opacity .34s ease, transform .34s cubic-bezier(.3,.9,.4,1)",
              }}
            >
              <p
                style={{
                  fontSize: "clamp(18px, 2.2vw, 26px)",
                  lineHeight: 1.4,
                  letterSpacing: -0.7,
                  color: "#fafaf6",
                  fontWeight: 400,
                  margin: "0 0 30px",
                  maxWidth: 580,
                }}
              >
                {d.q}
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  marginTop: "auto",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: -0.3,
                    background: "rgba(198,255,58,0.14)",
                    color: "#c6ff3a",
                    border: "1px solid rgba(198,255,58,0.35)",
                  }}
                >
                  {d.av}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 500,
                      letterSpacing: -0.2,
                      color: "#fafaf6",
                      lineHeight: 1.3,
                    }}
                  >
                    {d.name}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: 0.6,
                      color: "#7d7d76",
                      textTransform: "uppercase",
                      marginTop: 2,
                    }}
                  >
                    Feedback anonimizado
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{
                position: "relative",
                zIndex: 1,
                height: 3,
                borderRadius: 99,
                background: "rgba(250,250,246,0.12)",
                overflow: "hidden",
                marginTop: 26,
              }}
            >
              <div
                key={`${idx}${paused ? "-p" : ""}`}
                style={{
                  height: "100%",
                  background: "#c6ff3a",
                  borderRadius: 99,
                  width: "100%",
                  transformOrigin: "left",
                  animation: `dpFill ${INTERVAL}ms linear`,
                  animationPlayState: paused ? "paused" : "running",
                }}
              />
            </div>
          </article>

          {/* Roster */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridAutoRows: "1fr",
              gap: 10,
            }}
          >
            {DATA.map((item, i) => {
              const on = i === idx;
              return (
                <button
                  key={item.av}
                  type="button"
                  onClick={() => {
                    setPaused(false);
                    go(i);
                  }}
                  style={{
                    background: on ? "#0a0a0a" : "#fafaf6",
                    border: on
                      ? "1px solid #0a0a0a"
                      : "1px solid rgba(10,10,10,0.08)",
                    borderRadius: 13,
                    padding: "15px 16px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 11,
                    fontFamily: "inherit",
                    color: on ? "#fafaf6" : "#2a2620",
                    boxShadow: on
                      ? "0 16px 34px -16px rgba(10,10,10,0.4)"
                      : "none",
                    transition: "all .35s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: -0.3,
                        background: on
                          ? "rgba(198,255,58,0.16)"
                          : "rgba(10,10,10,0.05)",
                        color: on ? "#c6ff3a" : "#2a2620",
                        border: on
                          ? "1px solid rgba(198,255,58,0.35)"
                          : "1px solid rgba(10,10,10,0.08)",
                      }}
                    >
                      {item.av}
                    </span>
                    <span style={{ display: "inline-flex", gap: 2.5 }}>
                      {[...Array(5)].map((_, s) => (
                        <Star
                          // biome-ignore lint/suspicious/noArrayIndexKey: static stars
                          key={s}
                          size={10}
                          fill={on ? "#c6ff3a" : "rgba(31,28,23,0.32)"}
                        />
                      ))}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      lineHeight: 1.35,
                      letterSpacing: -0.1,
                    }}
                  >
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            marginTop: 56,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: 0.4,
              color: "#8a8a85",
              textTransform: "uppercase",
            }}
          >
            Teste com uma vaga real
          </span>
          <a
            href="/adaptar"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              padding: "15px 24px",
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: -0.1,
              textDecoration: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            }}
            className="lp-cta-primary"
          >
            Analisar meu CV grátis <span className="lp-cta-arrow">→</span>
          </a>
        </div>
      </div>

      <style>{`
        @keyframes dpFill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>
    </section>
  );
}
