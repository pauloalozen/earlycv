"use client";

import { useState } from "react";
import { BrowserChrome, browserFrame, GEIST, MONO } from "./_shared";

/** Illustrative mockup — no real screenshot exists yet for this feature. */
export function GestaoMock() {
  const rows = [
    {
      role: "Engenheira de Dados Sênior",
      status: "Entrevista agendada",
      tone: "#84cc16",
      when: "vaga salva há 3 dias",
    },
    {
      role: "Analista de Produto Pleno",
      status: "CV enviado",
      tone: "#8a8a85",
      when: "vaga salva há 6 dias",
    },
    {
      role: "Desenvolvedora Backend",
      status: "Em preparação",
      tone: "#f59e0b",
      when: "vaga salva há 1 semana",
    },
  ];
  return (
    <div
      style={{
        background: "#fff",
        padding: "28px 26px",
        fontFamily: GEIST,
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#8a8a85",
          marginBottom: 16,
        }}
      >
        Minhas candidaturas
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <div
            key={r.role}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#0a0a0a" }}>
                {r.role}
              </div>
              <div style={{ fontSize: 11.5, color: "#8a8a85", marginTop: 2 }}>
                {r.when}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: r.tone,
                background: `${r.tone}1a`,
                borderRadius: 999,
                padding: "5px 10px",
                whiteSpace: "nowrap",
              }}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Illustrative mockup — no real screenshot exists yet for this feature. */
export function PreparacaoMock() {
  const items = [
    {
      label: "Perguntas técnicas",
      example:
        "Como você lidaria com um pipeline que falha silenciosamente em produção?",
    },
    {
      label: "Perguntas comportamentais",
      example:
        "Conte sobre uma vez que discordou de uma decisão do seu gestor.",
    },
    {
      label: "Ponto do seu CV",
      example:
        "Redução de 30% no tempo de processamento — prepare-se pra detalhar como chegou lá.",
    },
  ];
  return (
    <div
      style={{
        background: "#0a0a0a",
        padding: "28px 26px",
        fontFamily: GEIST,
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#8a8a85",
          marginBottom: 16,
        }}
      >
        Roteiro — Engenheira de Dados Sênior
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it) => (
          <div
            key={it.label}
            style={{
              background: "rgba(250,250,246,0.06)",
              border: "1px solid rgba(250,250,246,0.1)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#c6ff3a",
                marginBottom: 6,
              }}
            >
              {it.label}
            </div>
            <div style={{ fontSize: 13, color: "#e4e4e0", lineHeight: 1.5 }}>
              {it.example}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type FeatureKey = "analise" | "otimizacao" | "radar" | "gestao" | "preparacao";

const FEATURES: {
  key: FeatureKey;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "analise",
    label: "Análise de CV",
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M20 20l-4.35-4.35" />
      </>
    ),
  },
  {
    key: "otimizacao",
    label: "Otimização de CV",
    icon: (
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    ),
  },
  {
    key: "radar",
    label: "Radar de Oportunidades",
    icon: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M12 12L19 8" />
        <path d="M5 12a7 7 0 0114 0M2.5 12a9.5 9.5 0 0119 0" />
      </>
    ),
  },
  {
    key: "gestao",
    label: "Gestão de Candidaturas",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 14h3" />
      </>
    ),
  },
  {
    key: "preparacao",
    label: "Preparação para Entrevistas",
    icon: (
      <>
        <path d="M8 10h8M8 14h5" />
        <path d="M4 4h16v13H8l-4 3V4z" />
      </>
    ),
  },
];

const IMAGE_BY_KEY: Record<
  Exclude<FeatureKey, "gestao" | "preparacao">,
  { src: string; alt: string }
> = {
  analise: { src: "/landing/f-resultado.jpg", alt: "Score ATS earlyCV" },
  otimizacao: { src: "/landing/f-adaptar.jpg", alt: "Adaptação de CV earlyCV" },
  radar: { src: "/landing/f-radar.jpg", alt: "Radar de vagas earlyCV" },
};

/** Interactive pill row + matching visual — clicking a pill swaps the frame content. */
export function FeatureShowcase() {
  const [active, setActive] = useState<FeatureKey>("analise");

  return (
    <>
      <div
        className="lp-f-pill-row reveal-card"
        style={{ marginTop: 18, marginBottom: 36 }}
      >
        {FEATURES.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setActive(f.key)}
            className={`lp-f-pill${active === f.key ? " is-active" : ""}`}
            style={{ border: undefined, cursor: "pointer" }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={active === f.key ? "#fff" : "#6a6a66"}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>{f.label}</title>
              {f.icon}
            </svg>
            {f.label}
          </button>
        ))}
        <span
          className="lp-f-pill"
          style={{ opacity: 0.55, cursor: "default" }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6a6a66"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Alerta de Vagas</title>
            <path d="M10 21a2 2 0 003.46 0" />
            <path d="M4 17h16l-1.6-2.4A6 6 0 0117 11V9a5 5 0 00-10 0v2a6 6 0 01-1.4 3.6L4 17z" />
          </svg>
          Alerta de Vagas
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: 0.5,
              color: "#8a8a85",
              marginLeft: 2,
            }}
          >
            em breve
          </span>
        </span>
      </div>

      <div
        className="reveal-card"
        style={{ ...browserFrame, maxWidth: 900, width: "100%" }}
      >
        <BrowserChrome />
        {active === "gestao" ? (
          <GestaoMock />
        ) : active === "preparacao" ? (
          <PreparacaoMock />
        ) : (
          // biome-ignore lint/performance/noImgElement: marketing screenshot, not an optimizable asset pipeline
          <img
            src={IMAGE_BY_KEY[active].src}
            alt={IMAGE_BY_KEY[active].alt}
            width={950}
            height={660}
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        )}
      </div>
    </>
  );
}
