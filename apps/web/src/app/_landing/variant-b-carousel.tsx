"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";

type CVExample = {
  id: string;
  area: string;
  targetRole: string;
  person: { name: string; titleBefore: string; titleAfter: string };
  before: {
    sectionLabel: string;
    summaryBad: string;
    company: string;
    bulletsBad: string[];
    skills: string[];
  };
  after: {
    sectionLabel: string;
    summaryGood: string;
    company: string;
    bulletsGood: string[];
    relevantSkills: string[];
    neutralSkills: string[];
  };
};

const EXAMPLES: CVExample[] = [
  {
    id: "pm",
    area: "Produto / PM",
    targetRole: "Sr. PM · Growth & Dados",
    person: {
      name: "Ana Costa",
      titleBefore: "Gerente de Produto",
      titleAfter: "Senior PM · Growth & Dados",
    },
    before: {
      sectionLabel: "Objetivo",
      summaryBad:
        "Profissional com experiência em gestão de projetos e produtos digitais buscando nova oportunidade de crescimento.",
      company: "Product Manager · StartupXYZ",
      bulletsBad: [
        "Responsável por conduzir cerimônias ágeis e reuniões com stakeholders.",
        "Trabalhei com dados para tomada de decisão e melhoria de processos.",
      ],
      skills: ["Jira", "Scrum", "Excel", "Analytics", "Figma"],
    },
    after: {
      sectionLabel: "Resumo profissional",
      summaryGood:
        "PM com 5 anos focada em produtos data-driven. Histórico de crescimento de ativação e retenção em empresas B2C com foco em mobile.",
      company: "Product Manager · StartupXYZ",
      bulletsGood: [
        "Liderou redução de churn em 23% via A/B com dados comportamentais (Mixpanel + SQL).",
        "Definiu OKRs de ativação para produto mobile com 180k usuários ativos.",
      ],
      relevantSkills: ["Growth", "SQL", "Mixpanel", "A/B Testing", "OKRs"],
      neutralSkills: ["Figma"],
    },
  },
  {
    id: "dev",
    area: "Engenharia / Backend",
    targetRole: "Backend Sênior · Fintech",
    person: {
      name: "Rafael Silva",
      titleBefore: "Desenvolvedor Backend",
      titleAfter: "Backend Engineer · Sistemas Financeiros",
    },
    before: {
      sectionLabel: "Objetivo",
      summaryBad:
        "Desenvolvedor com experiência em construção de APIs e sistemas backend para aplicações corporativas.",
      company: "Backend Developer · AgênciaTech",
      bulletsBad: [
        "Desenvolvi APIs e trabalhei com banco de dados SQL e NoSQL.",
        "Participei de projetos de modernização de sistemas legados.",
      ],
      skills: ["Java", "Spring", "PostgreSQL", "Docker", "REST"],
    },
    after: {
      sectionLabel: "Resumo profissional",
      summaryGood:
        "Backend Engineer especializado em sistemas financeiros de alta disponibilidade. APIs transacionais com SLA de 99.9%.",
      company: "Backend Developer · AgênciaTech",
      bulletsGood: [
        "Construiu API de pagamentos processando R$2M/dia com latência p99 < 120ms e zero downtime em 14 meses.",
        "Liderou migração para microsserviços reduzindo custo de infra em 34%.",
      ],
      relevantSkills: ["Java", "Spring Boot", "PostgreSQL", "Kafka"],
      neutralSkills: ["Docker", "REST"],
    },
  },
  {
    id: "design",
    area: "Design / UX",
    targetRole: "Product Designer · Startup",
    person: {
      name: "Juliana Matos",
      titleBefore: "UX Designer",
      titleAfter: "Product Designer · Growth UX",
    },
    before: {
      sectionLabel: "Objetivo",
      summaryBad:
        "Designer com experiência em criação de wireframes e protótipos para aplicações mobile e web.",
      company: "UX Designer · StartupFinanças",
      bulletsBad: [
        "Fiz wireframes e protótipos para fluxos de onboarding mobile.",
        "Trabalhei com times de produto para definir interface e usabilidade.",
      ],
      skills: ["Figma", "Protótipo", "Pesquisa", "Wireframe"],
    },
    after: {
      sectionLabel: "Resumo profissional",
      summaryGood:
        "Product Designer focada em crescimento. Especialista em onboarding e fluxos de ativação com impacto mensurável em conversão.",
      company: "UX Designer · StartupFinanças",
      bulletsGood: [
        "Redesenhou onboarding aumentando taxa de ativação em 31% (A/B com n=12k usuários).",
        "Criou design system adotado por 3 squads, reduzindo tempo de entrega de UI em 40%.",
      ],
      relevantSkills: ["Figma", "Design System", "A/B Testing", "Ativação"],
      neutralSkills: ["Protótipo", "Pesquisa"],
    },
  },
  {
    id: "data",
    area: "Dados / Analytics",
    targetRole: "Data Analyst · E-commerce",
    person: {
      name: "Marcos Rocha",
      titleBefore: "Analista de Dados",
      titleAfter: "Sr. Data Analyst · Retenção & Growth",
    },
    before: {
      sectionLabel: "Objetivo",
      summaryBad:
        "Analista com experiência em análise de dados e criação de dashboards para apoio à tomada de decisão.",
      company: "Analista de Dados · VarejoPlus",
      bulletsBad: [
        "Criei dashboards e relatórios de vendas para lideranças.",
        "Analisei dados de comportamento de clientes usando SQL e Python.",
      ],
      skills: ["SQL", "Python", "Power BI", "Excel", "Tableau"],
    },
    after: {
      sectionLabel: "Resumo profissional",
      summaryGood:
        "Data Analyst com foco em retenção e comportamento de usuário. Modelos preditivos e experimentação em e-commerce de alto volume.",
      company: "Analista de Dados · VarejoPlus",
      bulletsGood: [
        "Construiu modelo preditivo de churn (precision 84%) reduzindo abandono em 18% no trimestre.",
        "Estruturou pipeline de jornada do cliente, acelerando decisões de campanha em 3×.",
      ],
      relevantSkills: ["SQL", "Python", "Churn Prediction", "A/B Testing"],
      neutralSkills: ["Power BI", "Tableau"],
    },
  },
];

const AUTO_ADVANCE_MS = 8500;

export function BeforeAfterCarousel() {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progressKey, setProgressKey] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback((idx: number) => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCurrent(idx);
      setProgressKey((k) => k + 1);
      setVisible(true);
    }, 220);
  }, []);

  const prev = useCallback(() => {
    goTo((current - 1 + EXAMPLES.length) % EXAMPLES.length);
  }, [current, goTo]);

  const next = useCallback(() => {
    goTo((current + 1) % EXAMPLES.length);
  }, [current, goTo]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const delta = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(delta) < 40) return;
      if (delta < 0) next();
      else prev();
    },
    [next, prev],
  );

  // Auto-advance
  useEffect(() => {
    const t = setTimeout(() => {
      goTo((current + 1) % EXAMPLES.length);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [current, goTo]);

  const ex = EXAMPLES[current];

  const arrowBtn: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "1px solid rgba(10,10,10,0.12)",
    background: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    color: "#0a0a0a",
    transition: "background 0.15s",
    flexShrink: 0,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  };

  return (
    <div>
      {/* Controls bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {/* Area label */}
        <span
          className="ba-area-label"
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 1.2,
            color: "#555",
            background: "rgba(10,10,10,0.05)",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 999,
            padding: "3px 10px",
            textTransform: "uppercase",
          }}
        >
          {ex.area}
        </span>

        {/* Dots + arrows */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {EXAMPLES.map((e, i) => (
              <button
                key={e.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Ver exemplo ${i + 1}`}
                style={{
                  width: i === current ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === current ? "#0a0a0a" : "rgba(10,10,10,0.18)",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={prev}
            className="ba-arrow-btn"
            style={arrowBtn}
            aria-label="Anterior"
          >
            ←
          </button>
          <button
            type="button"
            onClick={next}
            className="ba-arrow-btn"
            style={arrowBtn}
            aria-label="Próximo"
          >
            →
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 2,
          background: "rgba(10,10,10,0.07)",
          borderRadius: 99,
          marginBottom: 24,
          overflow: "hidden",
        }}
      >
        <div
          key={progressKey}
          style={{
            height: "100%",
            background: "#c6ff3a",
            borderRadius: 99,
            animation: `baProgress ${AUTO_ADVANCE_MS}ms linear forwards`,
          }}
        />
      </div>

      {/* Cards — equal height via stretch grid */}
      <div
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 0.22s ease",
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="ba-grid-b"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 40px 1fr",
            alignItems: "stretch",
          }}
        >
          {/* Before */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              className="ba-label ba-label-bad"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                padding: "4px 12px",
                borderRadius: 999,
                background: "rgba(220,50,50,0.1)",
                color: "#b83535",
                marginBottom: 12,
                fontFamily: MONO,
                alignSelf: "flex-start",
              }}
            >
              <span className="ba-label-full">✗ Antes — CV genérico</span>
              <span className="ba-label-short">✗ Antes</span>
            </div>
            <div
              className="ba-card"
              style={{
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.07)",
                borderRadius: 16,
                padding: 22,
                fontSize: 12,
                lineHeight: 1.6,
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  paddingBottom: 12,
                  borderBottom: "1px solid rgba(10,10,10,0.07)",
                  marginBottom: 12,
                }}
              >
                <div
                  className="ba-name"
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0a0a0a",
                    marginBottom: 2,
                  }}
                >
                  {ex.person.name}
                </div>
                <div
                  className="ba-title"
                  style={{ color: "#8a8a85", fontSize: 12 }}
                >
                  {ex.person.titleBefore}
                </div>
              </div>

              <div
                className="ba-section-label"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "#bbb",
                  margin: "10px 0 6px",
                }}
              >
                {ex.before.sectionLabel}
              </div>
              <div
                className="cv-highlight-bad"
                style={{ paddingRight: 76, marginBottom: 10 }}
              >
                {ex.before.summaryBad}
                <span className="cv-tag-bad">✗ genérico</span>
              </div>

              <div className="ba-exp-section">
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "#bbb",
                    margin: "10px 0 6px",
                  }}
                >
                  Experiência
                </div>
                <div
                  style={{
                    color: "#0a0a0a",
                    fontWeight: 500,
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  {ex.before.company}
                </div>
                {ex.before.bulletsBad.map((b) => (
                  <div
                    key={b}
                    className="cv-highlight-bad"
                    style={{ paddingRight: 76, marginBottom: 5 }}
                  >
                    {b}
                    <span className="cv-tag-bad">✗ genérico</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "auto", paddingTop: 14 }}>
                <div
                  className="ba-section-label"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "#bbb",
                    marginBottom: 8,
                  }}
                >
                  Skills
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {ex.before.skills.map((s) => (
                    <span key={s} className="cv-tag-neutral">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Arrow divider */}
          <div
            className="ba-middle-divider"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 42,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "#f0f0ea",
                border: "1px solid rgba(10,10,10,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              }}
            >
              →
            </div>
          </div>

          {/* After */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              className="ba-label ba-label-good"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                padding: "4px 12px",
                borderRadius: 999,
                background: "rgba(198,255,58,0.12)",
                color: "#4a7a10",
                marginBottom: 12,
                fontFamily: MONO,
                alignSelf: "flex-start",
              }}
            >
              <span className="ba-label-full">
                ✓ Depois — Ajustado para a vaga
              </span>
              <span className="ba-label-short">✓ Depois</span>
            </div>
            <div
              className="ba-card"
              style={{
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.07)",
                borderRadius: 16,
                padding: 22,
                fontSize: 12,
                lineHeight: 1.6,
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  paddingBottom: 12,
                  borderBottom: "1px solid rgba(10,10,10,0.07)",
                  marginBottom: 12,
                }}
              >
                <div
                  className="ba-name"
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0a0a0a",
                    marginBottom: 2,
                  }}
                >
                  {ex.person.name}
                </div>
                <div
                  className="ba-title"
                  style={{ color: "#8a8a85", fontSize: 12 }}
                >
                  {ex.person.titleAfter}
                </div>
              </div>

              <div
                className="ba-section-label"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "#bbb",
                  margin: "10px 0 6px",
                }}
              >
                {ex.after.sectionLabel}
              </div>
              <div
                className="cv-highlight-good"
                style={{ paddingRight: 76, marginBottom: 10 }}
              >
                {ex.after.summaryGood}
                <span className="cv-tag-good">✓ alinhado</span>
              </div>

              <div className="ba-exp-section">
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "#bbb",
                    margin: "10px 0 6px",
                  }}
                >
                  Experiência
                </div>
                <div
                  style={{
                    color: "#0a0a0a",
                    fontWeight: 500,
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  {ex.after.company}
                </div>
                {ex.after.bulletsGood.map((b) => (
                  <div
                    key={b}
                    className="cv-highlight-good"
                    style={{ paddingRight: 76, marginBottom: 5 }}
                  >
                    {b}
                    <span className="cv-tag-good">✓ alinhado</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "auto", paddingTop: 14 }}>
                <div
                  className="ba-section-label"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "#bbb",
                    marginBottom: 8,
                  }}
                >
                  <span className="ba-skills-full">
                    Skills relevantes para essa vaga
                  </span>
                  <span className="ba-skills-short">Skills</span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {ex.after.relevantSkills.map((s) => (
                    <span key={s} className="cv-tag-active">
                      {s}
                    </span>
                  ))}
                  {ex.after.neutralSkills.map((s) => (
                    <span key={s} className="cv-tag-neutral">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes baProgress {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .ba-label-short { display: none; }
        .ba-skills-short { display: none; }
        .cv-section-label {
          font-size: 10px; font-weight: 600;
          letter-spacing: 1.2px; text-transform: uppercase;
          color: #bbb; margin: 12px 0 6px;
        }
        .cv-highlight-bad {
          background: rgba(220,50,50,0.07);
          border-left: 2px solid rgba(220,50,50,0.45);
          padding: 4px 8px; border-radius: 0 4px 4px 0;
          color: #5a5a55; margin-bottom: 5px;
          font-size: 12px; position: relative;
        }
        .cv-highlight-good {
          background: rgba(198,255,58,0.1);
          border-left: 2px solid #c6ff3a;
          padding: 4px 8px; border-radius: 0 4px 4px 0;
          color: #0a0a0a; margin-bottom: 5px;
          font-size: 12px; position: relative;
        }
        .cv-tag-bad {
          position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
          font-size: 10px; color: #b83535;
          font-family: var(--font-geist-mono), monospace;
          white-space: nowrap;
        }
        .cv-tag-good {
          position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
          font-size: 10px; color: #4a7a10;
          font-family: var(--font-geist-mono), monospace;
          white-space: nowrap;
        }
        .cv-tag-neutral {
          font-size: 10px; padding: 2px 7px; border-radius: 4px;
          background: rgba(10,10,10,0.05); border: 1px solid rgba(10,10,10,0.08);
          color: #5a5a55;
        }
        .cv-tag-active {
          font-size: 10px; padding: 2px 7px; border-radius: 4px;
          background: rgba(198,255,58,0.12); border: 1px solid rgba(198,255,58,0.3);
          color: #4a7a10;
        }
        @media (max-width: 768px) {
          .ba-arrow-btn { display: none !important; }
          .ba-area-label { font-size: 9.5px !important; letter-spacing: 0.8px !important; }
          .ba-grid-b { grid-template-columns: 1fr !important; gap: 8px !important; }
          .ba-middle-divider { display: none !important; }
          .ba-exp-section { display: none !important; }
          .ba-label-full { display: none !important; }
          .ba-label-short { display: inline !important; }
          .ba-skills-full { display: none !important; }
          .ba-skills-short { display: inline !important; }
          .ba-label { margin-bottom: 6px !important; padding: 3px 10px !important; }
          .ba-card {
            padding: 12px 14px !important;
            border-radius: 12px !important;
          }
          .ba-card > div:first-child { padding-bottom: 8px !important; margin-bottom: 8px !important; }
          .ba-name { font-size: 13px !important; }
          .ba-title { font-size: 11px !important; }
          .ba-section-label { margin: 6px 0 4px !important; font-size: 9px !important; }
          .cv-highlight-bad, .cv-highlight-good {
            padding-right: 8px !important;
            font-size: 11px !important;
            line-height: 1.4 !important;
            margin-bottom: 0 !important;
          }
          .cv-tag-bad, .cv-tag-good { display: none !important; }
          .ba-card > div:last-child { padding-top: 8px !important; }
          .cv-tag-neutral, .cv-tag-active { font-size: 10px !important; }
        }
      `}</style>
    </div>
  );
}
