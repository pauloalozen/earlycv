"use client";

import { useEffect, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";

/** Illustrative mockups styled after LinkedIn job postings — not real
 * screenshots — each paired with the same job as it would appear on the
 * Radar, days earlier and with fewer competitors. */
const JOBS = [
  {
    title: "Gerente de TI",
    location: "São Paulo, São Paulo, Brasil",
    postedLinkedIn: "há 3 semanas",
    applicants: "Mais de 100 pessoas",
    badges: ["Híbrido", "Tempo integral"],
    postedRadar: "Publicada há 2 dias, direto na fonte",
  },
  {
    title: "Desenvolvedora Backend Sênior",
    location: "Remoto, Brasil",
    postedLinkedIn: "há 2 semanas",
    applicants: "Mais de 200 pessoas",
    badges: ["Remoto", "Tempo integral"],
    postedRadar: "Publicada há 3 dias, direto na fonte",
  },
  {
    title: "Analista de Dados Pleno",
    location: "Rio de Janeiro, Rio de Janeiro, Brasil",
    postedLinkedIn: "há 1 mês",
    applicants: "Mais de 300 pessoas",
    badges: ["Presencial", "Tempo integral"],
    postedRadar: "Publicada há 1 dia, direto na fonte",
  },
  {
    title: "Product Manager",
    location: "São Paulo, São Paulo, Brasil",
    postedLinkedIn: "há 4 dias",
    applicants: "Mais de 80 pessoas",
    badges: ["Híbrido", "Tempo integral"],
    postedRadar: "Publicada há algumas horas, direto na fonte",
  },
  {
    title: "Engenheira de Machine Learning",
    location: "Remoto, Brasil",
    postedLinkedIn: "há 3 semanas",
    applicants: "Mais de 150 pessoas",
    badges: ["Remoto", "Tempo integral"],
    postedRadar: "Publicada há 2 dias, direto na fonte",
  },
  {
    title: "UX/UI Designer Pleno",
    location: "Belo Horizonte, Minas Gerais, Brasil",
    postedLinkedIn: "há 2 semanas",
    applicants: "Mais de 120 pessoas",
    badges: ["Híbrido", "Tempo integral"],
    postedRadar: "Publicada há 1 dia, direto na fonte",
  },
] as const;

const INTERVAL = 4200;

function LinkedInBadge({ size = 18 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        background: "#0a66c2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: "#fff",
          fontSize: size * 0.52,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          lineHeight: 1,
        }}
      >
        in
      </span>
    </div>
  );
}

const pillOutline: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 500,
  color: "#3a3a38",
  border: "1px solid rgba(10,10,10,0.18)",
  borderRadius: 999,
  padding: "5px 12px",
};

export function LinkedInVsRadarMock() {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        setIdx((idx + 1) % JOBS.length);
        setFading(false);
      }, 320);
    }, INTERVAL);
    return () => clearTimeout(t);
  });

  const job = JOBS[idx];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pause-on-hover for animated mockup
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        maxWidth: 440,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.12)",
          borderRadius: 14,
          padding: "22px 24px",
          boxShadow: "0 20px 40px -26px rgba(10,10,10,0.25)",
          opacity: fading ? 0 : 1,
          transform: fading ? "translateY(-6px)" : "none",
          transition: "opacity 320ms ease, transform 320ms ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LinkedInBadge />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#6a6a66",
                letterSpacing: 0.2,
              }}
            >
              LinkedIn
            </span>
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 0.4,
              color: "#c4c3bd",
            }}
          >
            {String(idx + 1).padStart(2, "0")}/
            {String(JOBS.length).padStart(2, "0")}
          </span>
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: -0.2,
            marginBottom: 6,
            color: "#0a0a0a",
          }}
        >
          {job.title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "#6a6a66",
            lineHeight: 1.55,
            marginBottom: 4,
          }}
        >
          {job.location} · {job.postedLinkedIn} ·{" "}
          <span className="lp-fv2-marker">
            <svg
              className="lp-fv2-marker-svg"
              viewBox="0 0 100 46"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <title>destaque</title>
              <path d="M4,22 C20,14 38,9 53,10 C68,11 84,15 96,20 L94,42 C84,37 68,33 52,32 C38,31 20,36 6,42 Z" />
            </svg>
            {job.applicants}
          </span>{" "}
          clicaram em Candidatar-se
        </div>
        <div style={{ fontSize: 12, color: "#8a8a85", marginBottom: 16 }}>
          Respostas gerenciadas fora do LinkedIn
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {job.badges.map((b) => (
            <span key={b} style={pillOutline}>
              ✓ {b}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#0a66c2",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              borderRadius: 999,
              padding: "9px 18px",
            }}
          >
            Candidatar-se ↗
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid #0a66c2",
              color: "#0a66c2",
              fontSize: 13.5,
              fontWeight: 600,
              borderRadius: 999,
              padding: "9px 18px",
            }}
          >
            Salvar
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8a8a85"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Enquanto isso, no Radar</title>
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "#8a8a85",
          }}
        >
          Essa vaga, no Radar
        </span>
      </div>

      <div
        style={{
          background: "#0a0a0a",
          borderRadius: 14,
          padding: "22px 24px",
          opacity: fading ? 0 : 1,
          transform: fading ? "translateY(6px)" : "none",
          transition: "opacity 320ms ease, transform 320ms ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              background: "rgba(198,255,58,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c6ff3a"
              strokeWidth="2.4"
            >
              <title>Radar earlyCV</title>
              <circle cx="12" cy="12" r="2" />
              <path d="M12 12L18 8" />
              <path d="M6 12a6 6 0 0112 0" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#a0a098",
              letterSpacing: 0.2,
            }}
          >
            Radar de Oportunidades
          </span>
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: -0.2,
            marginBottom: 6,
            color: "#fafaf6",
          }}
        >
          {job.title}
        </div>
        <div style={{ fontSize: 12.5, color: "#a0a098", marginBottom: 16 }}>
          {job.postedRadar}
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#c6ff3a",
            background: "rgba(198,255,58,0.14)",
            borderRadius: 999,
            padding: "6px 12px",
          }}
        >
          Você entre os primeiros a saber
        </span>
      </div>

      <style>{`
        .lp-fv2-marker {
          position: relative;
          z-index: 0;
          display: inline-block;
          font-weight: 700;
          color: #0a0a0a;
        }
        .lp-fv2-marker-svg {
          position: absolute;
          left: -6%;
          right: -6%;
          top: -35%;
          bottom: -20%;
          width: 112%;
          height: 155%;
          z-index: -1;
          transform: rotate(-1deg);
        }
        .lp-fv2-marker-svg path {
          fill: rgba(198, 255, 58, 0.65);
        }
      `}</style>
    </div>
  );
}
