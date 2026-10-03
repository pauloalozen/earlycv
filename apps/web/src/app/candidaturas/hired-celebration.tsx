"use client";

import { type CSSProperties, type ReactNode, useMemo } from "react";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Popup de parabéns pela contratação — usado no detalhe da candidatura (com
// "Concluir candidatura", que grava o status) e no quadro de /candidaturas
// (status já gravado ao escolher Contratado; só fechar / ver candidatura).
// `mounted` controla a animação de entrada/saída (quem abre faz o fade).

export function HiredConfetti({ active }: { active: boolean }) {
  const pieces = useMemo(() => {
    const arr = [];
    const rand = (seed: number) => {
      const x = Math.sin(seed * 9999) * 10000;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 40; i++) {
      const r1 = rand(i + 1);
      const r2 = rand(i + 31);
      const r3 = rand(i + 71);
      const r4 = rand(i + 113);
      arr.push({
        i,
        left: 8 + r1 * 84,
        dx: (r2 - 0.5) * 260,
        rot: 200 + r3 * 720,
        dur: 1.8 + r4 * 1.4,
        delay: r1 * 0.45,
        size: 6 + r2 * 8,
        color: (
          ["#c6ff3a", "#0a0a0a", "#f5c518", "#fafaf6", "#c6ff3a"] as const
        )[Math.floor(r3 * 5)],
        shape: r4 > 0.5 ? "rect" : "circle",
      });
    }
    return arr;
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
        borderRadius: 20,
      }}
    >
      {pieces.map((p) => (
        <span
          key={p.i}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "18%",
            width: p.size,
            height: p.shape === "circle" ? p.size : p.size * 0.5,
            background: p.color,
            borderRadius: p.shape === "circle" ? "50%" : 2,
            opacity: 0,
            // @ts-expect-error CSS custom properties
            "--dx": `${p.dx}px`,
            "--rot": `${p.rot}deg`,
            animation: active
              ? `cv-fall-loop 5s cubic-bezier(0.22,0.61,0.36,1) ${p.delay}s infinite`
              : "none",
            boxShadow:
              p.color === "#c6ff3a" ? "0 0 8px rgba(198,255,58,0.4)" : "none",
          }}
        />
      ))}
    </div>
  );
}

export function HiredCelebrationDialog({
  mounted,
  companyName,
  jobTitle,
  actions,
  footerNote = "◎ CV enviado preservado · candidatura finalizada como contratada",
}: {
  mounted: boolean;
  companyName: string;
  jobTitle: string;
  actions: ReactNode;
  footerNote?: string;
}) {
  const stagger = (delay: number): CSSProperties => ({
    transform: mounted ? "translateY(0)" : "translateY(8px)",
    opacity: mounted ? 1 : 0,
    transition: `transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}s, opacity 0.45s ease-out ${delay}s`,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,10,0.45)",
        padding: "0 16px",
        opacity: mounted ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
    >
      <style>{`
        @keyframes cv-fall {
          0%   { transform: translate3d(0,-40px,0) rotate(0deg); opacity: 0; }
          12%  { opacity: 1; }
          100% { transform: translate3d(var(--dx,0),480px,0) rotate(var(--rot,540deg)); opacity: 0; }
        }
        @keyframes cv-fall-loop {
          0%   { transform: translate3d(0,-40px,0) rotate(0deg); opacity: 0; }
          8%   { opacity: 1; }
          48%  { transform: translate3d(var(--dx,0),520px,0) rotate(var(--rot,540deg)); opacity: 0; }
          100% { transform: translate3d(0,-40px,0) rotate(0deg); opacity: 0; }
        }
        @keyframes cv-pulse {
          0%   { transform: scale(0.6); opacity: 0.55; }
          70%  { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hired-celebration-title"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 500,
          background: "#fafaf6",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 72px rgba(10,10,10,0.22)",
        }}
      >
        <HiredConfetti active={mounted} />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "40px 28px 28px",
            textAlign: "center",
          }}
        >
          {/* Check circle */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  background: "rgba(198,255,58,0.55)",
                  animation: mounted
                    ? "cv-pulse 1.6s ease-out 0.1s 1 forwards"
                    : "none",
                }}
              />
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  border: "1px solid rgba(64,84,16,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    "0 6px 20px -6px rgba(198,255,58,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
                  position: "relative",
                  zIndex: 2,
                }}
              >
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <title>Confirmação de contratação</title>
                  <path
                    d="M5 12.5l4.5 4.5L19 7"
                    stroke="#0a0a0a"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 30,
                      strokeDashoffset: mounted ? 0 : 30,
                      transition:
                        "stroke-dashoffset 0.55s cubic-bezier(0.6,0,0.4,1) 0.2s",
                    }}
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Label */}
          <div
            style={{
              ...stagger(0.3),
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "#8a8a85",
              fontWeight: 500,
              marginBottom: 14,
            }}
          >
            STATUS · CONTRATADO
          </div>

          {/* Title */}
          <div style={stagger(0.38)}>
            <h2
              id="hired-celebration-title"
              style={{
                margin: "0 0 6px",
                fontSize: 26,
                fontWeight: 500,
                letterSpacing: "-0.04em",
                lineHeight: 1.1,
                color: "#0a0a0a",
                fontFamily: GEIST,
              }}
            >
              Parabéns!
            </h2>
            <div
              style={{
                fontSize: 22,
                fontWeight: 400,
                fontStyle: "italic",
                fontFamily: "var(--font-instrument-serif), Georgia, serif",
                color: "#0a0a0a",
                marginBottom: 16,
                lineHeight: 1.2,
              }}
            >
              Você foi contratado.
            </div>
          </div>

          {/* Body */}
          <div style={{ ...stagger(0.46), marginBottom: 28 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#5a5a55",
                lineHeight: 1.6,
                fontFamily: GEIST,
              }}
            >
              A vaga de {jobTitle} na {companyName} é sua. Atualizamos a jornada
              e guardamos o CV que te levou até aqui.
            </p>
          </div>

          {/* Ações */}
          <div style={{ ...stagger(0.52), display: "flex", gap: 8 }}>
            {actions}
          </div>

          {/* Footer note */}
          <div style={{ ...stagger(0.56), marginTop: 16 }}>
            <span
              style={{
                fontSize: 11.5,
                color: "#a8a6a0",
                fontFamily: MONO,
                letterSpacing: 0.2,
              }}
            >
              {footerNote}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
