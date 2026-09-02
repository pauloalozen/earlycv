import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";

import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toCompanySlug } from "@/lib/company-slug";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyPlan } from "@/lib/plans-api";
import {
  getPublicJobBySlug,
  listPublicJobs,
  type PublicJob,
} from "@/lib/public-jobs-api";
import { type ExistingApplicationDto, getJobMatchScore } from "@/lib/radar-api";
import { getMyMasterResume } from "@/lib/resumes-api";
import { getAbsoluteUrl } from "@/lib/site";
import { AnalysisCtaButtons } from "../analysis-cta";
import { CompanyLogo } from "../company-logo";
import { ExternalApplyGate } from "../external-apply-gate";
import { JobDetailViewTracker } from "../job-detail-view-tracker";
import { RadarOpportunityLink } from "../radar-opportunity-link";
import {
  breakdownPct,
  type MatchBreakdown,
  type MatchData,
  OpportunityBadge,
  OpportunityRing,
  RADAR_AREA_LABELS,
  ScoreRing,
  SkillChip,
  scoreColor,
} from "../radar-ui";
import { SaveJobTextBtn } from "../save-job-btn";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF =
  "var(--font-instrument-serif), 'Instrument Serif', Georgia, serif";
const GRAIN = `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

const WORK_MODEL_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  "on-site": "Presencial",
};

const SENIORITY_LABELS: Record<string, string> = {
  intern: "Estagiário",
  junior: "Júnior",
  junior_level: "Júnior",
  jr: "Júnior",
  mid: "Pleno",
  mid_level: "Pleno",
  pleno: "Pleno",
  senior: "Sênior",
  senior_level: "Sênior",
  sr: "Sênior",
  lead: "Lead",
  tech_lead: "Tech Lead",
  staff: "Staff",
  principal: "Principal",
};

// CTAs de conversão do visitante anônimo (Agressivo-v2) sempre levam pro
// cadastro com `next` — sem isso, o usuário cai no default (/meu-perfil)
// depois de criar conta, perdendo o fio da ação que o trouxe até aqui.
const SIGNUP_NEXT_MONITOR = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent("/alerta-vaga-certa")}`;
const SIGNUP_NEXT_CV = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent("/meu-cv-master")}`;

type ScoreState = "anonymous" | "no-cv" | "has-cv";

type JobPageProps = {
  params: Promise<{ slug: string }>;
};

const BREAKDOWN_ROWS: Array<{ key: keyof MatchBreakdown; label: string }> = [
  { key: "area", label: "Área" },
  { key: "skills", label: "Skills" },
  { key: "seniority", label: "Senioridade" },
  { key: "technologies", label: "Tecnologias" },
  { key: "language", label: "Idioma" },
  { key: "workModel", label: "Modelo de trabalho" },
];

// Separadores usados por diferentes fontes de vaga pra marcar o
// subtítulo do cargo (ex.: "Backend — Plataforma de Pagamentos",
// "Analista SR - Full Stack", "Produto | Ecommerce"). Em ordem de
// prioridade — "—" é o mais específico, "-"/"|" aparecem soltos com
// mais frequência então só contam com espaço nos dois lados, senão
// cortariam palavra composta por engano (ex.: "SR-Pleno").
const TITLE_SPLIT_SEPARATORS = ["—", " - ", " | "] as const;

function splitJobTitleForDisplay(title: string): {
  lead: string;
  emphasis: string | null;
} {
  for (const separator of TITLE_SPLIT_SEPARATORS) {
    const index = title.indexOf(separator);
    if (index === -1) continue;

    const keepSeparatorInLead = separator === "—";
    const lead = title
      .slice(0, index + (keepSeparatorInLead ? separator.length : 0))
      .trim();
    const emphasis = title.slice(index + separator.length).trim();
    if (lead && emphasis) {
      return { lead, emphasis };
    }
  }

  return { lead: title, emphasis: null };
}

function dimensionDescription(
  key: keyof MatchBreakdown,
  pct: number,
  match: MatchData,
): string {
  if (key === "skills") {
    const total = match.matchedSkills.length + match.missingSkills.length;
    if (total === 0) return "sem skills-chave mapeadas nesta vaga";
    return `${match.matchedSkills.length} de ${total} skills-chave presentes`;
  }
  if (pct >= 70) return "forte alinhamento com seu perfil";
  if (pct >= 40) return "alinhamento parcial";
  return "pouco alinhado com seu perfil";
}

function CompatHead({ isAnalysis = false }: { isAnalysis?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.4,
          color: "#8a8a85",
          fontWeight: 500,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isAnalysis ? "#4ade80" : "#c6ff3a",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        {isAnalysis ? "ANÁLISE" : "OPORTUNIDADE"}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: "#8a8a85",
          letterSpacing: 0.3,
        }}
      >
        {isAnalysis ? "Baseado na sua candidatura" : "Baseado no seu perfil"}
      </span>
    </div>
  );
}

function BellIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <title>Monitor</title>
      <path
        d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke="#c6ff3a"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.73 21a2 2 0 01-3.46 0"
        stroke="#c6ff3a"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <title>Compatibilidade bloqueada</title>
      <rect
        x="5"
        y="11"
        width="14"
        height="9"
        rx="2"
        stroke="#c6ff3a"
        strokeWidth="1.8"
      />
      <path
        d="M8 11V7a4 4 0 018 0v4"
        stroke="#c6ff3a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Gate de compatibilidade acima da dobra, só pra visitante anônimo. O
// número é um placeholder deliberado (skeleton, não dígito) — sem CV do
// visitante não existe score real pra mostrar, e um número "de exemplo"
// já foi descartado por poder ser lido como dado calculado de verdade.
function MonitorGateBand() {
  const breakdownPreview: Array<{
    label: string;
    width: string;
    color: string;
  }> = [
    { label: "Skills técnicas", width: "82%", color: "#c6ff3a" },
    { label: "Senioridade", width: "65%", color: "#4ade80" },
    { label: "Tecnologias", width: "70%", color: "#c6ff3a" },
  ];

  return (
    <div
      style={{
        background: "#0a0a0a",
        borderRadius: 16,
        padding: "26px 28px",
        marginBottom: 28,
        color: "#fafaf6",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1.3,
              color: "#8a8a85",
              fontWeight: 500,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#c6ff3a",
                display: "inline-block",
              }}
            />
            É ASSIM QUE FICA SEU MATCH
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 9,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                width: 58,
                height: 24,
                borderRadius: 6,
                background:
                  "linear-gradient(90deg, rgba(250,250,246,0.06) 0%, rgba(250,250,246,0.16) 50%, rgba(250,250,246,0.06) 100%)",
              }}
            />
            <span style={{ color: "#8a8a85", fontSize: 16 }}>% de match</span>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: "#6a6560",
              marginBottom: 14,
            }}
          >
            o seu número aparece depois do CV
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxWidth: 340,
            }}
          >
            {breakdownPreview.map((row) => (
              <div key={row.label}>
                <div
                  style={{ fontSize: 11, color: "#c8c6bf", marginBottom: 3 }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    height: 5,
                    background: "rgba(250,250,246,0.1)",
                    borderRadius: 99,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: row.width,
                      background: row.color,
                      filter: "blur(5px)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            textAlign: "center",
            background: "rgba(250,250,246,0.04)",
            border: "1px solid rgba(250,250,246,0.08)",
            borderRadius: 14,
            padding: "22px 26px",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#e8e6df",
              marginBottom: 14,
              maxWidth: 220,
            }}
          >
            Suba seu CV pra ver o seu número — e onde você ganha ou perde
            pontos.
          </div>
          <a
            href={SIGNUP_NEXT_CV}
            style={{
              display: "block",
              background: "#c6ff3a",
              color: "#1c2a05",
              borderRadius: 9,
              padding: "13px 22px",
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Calcular meu match →
          </a>
        </div>
      </div>
    </div>
  );
}

// "Isso é só a porta de entrada" — vitrine do resto da plataforma pra
// visitante anônimo, no lugar de mais um CTA repetido de monitor.
function FeatureShowcaseStrip() {
  const items: Array<{ label: string; icon: ReactNode }> = [
    {
      label: "Análise de CV com IA",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <title>Análise de CV com IA</title>
          <circle cx="10" cy="10" r="6" stroke="#c6ff3a" strokeWidth="1.8" />
          <path
            d="M20 20l-5.5-5.5"
            stroke="#c6ff3a"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      label: "Carta de apresentação",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <title>Carta de apresentação</title>
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="2"
            stroke="#c6ff3a"
            strokeWidth="1.8"
          />
          <path
            d="M3 6.5l9 6.5 9-6.5"
            stroke="#c6ff3a"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      label: "Prep de entrevista",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <title>Prep de entrevista</title>
          <path
            d="M4 18v-3a4 4 0 014-4h1M13 11h1a4 4 0 014 4v3"
            stroke="#c6ff3a"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="8.5" cy="8" r="2.6" stroke="#c6ff3a" strokeWidth="1.8" />
          <circle cx="15.5" cy="8" r="2.6" stroke="#c6ff3a" strokeWidth="1.8" />
        </svg>
      ),
    },
    {
      label: "Gestão de candidaturas",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <title>Gestão de candidaturas</title>
          <rect
            x="3.5"
            y="4"
            width="5"
            height="16"
            rx="1.3"
            stroke="#c6ff3a"
            strokeWidth="1.8"
          />
          <rect
            x="10"
            y="4"
            width="5"
            height="10"
            rx="1.3"
            stroke="#c6ff3a"
            strokeWidth="1.8"
          />
          <rect
            x="16.5"
            y="4"
            width="4"
            height="13"
            rx="1.3"
            stroke="#c6ff3a"
            strokeWidth="1.8"
          />
        </svg>
      ),
    },
  ];

  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.1)",
        borderRadius: 12,
        padding: 22,
        marginBottom: 26,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: -0.2,
          margin: "0 0 3px",
        }}
      >
        Isso é só a porta de entrada.
      </div>
      <p
        style={{
          fontSize: 12,
          color: "#6a6560",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        O monitor avisa. Depois disso, o mesmo CV vira carta de apresentação,
        prep de entrevista e candidaturas organizadas — tudo em um lugar.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        {items.map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "#0a0a0a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 8px",
              }}
            >
              {item.icon}
            </div>
            <div style={{ fontSize: 10.5, color: "#3a3a38", lineHeight: 1.35 }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Destaque grande do Monitor, no lugar do fechamento genérico
// "outras oportunidades" — reforça o papel central do Monitor antes do
// visitante sair da página.
function MonitorHighlightBand() {
  return (
    <div
      style={{
        background: "#0a0a0a",
        borderRadius: 20,
        padding: "52px 40px",
        textAlign: "center",
        color: "#fafaf6",
        marginTop: 20,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <BellIcon size={34} />
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 1.4,
          color: "#c6ff3a",
          fontWeight: 600,
          marginBottom: 14,
        }}
      >
        MONITOR DE VAGAS
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: -1,
          lineHeight: 1.15,
          margin: "0 auto 14px",
          maxWidth: 620,
        }}
      >
        Receba vagas como essa — antes de todo mundo.
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#a8a6a0",
          margin: "0 auto 26px",
          maxWidth: 460,
          lineHeight: 1.6,
        }}
      >
        Assim que uma vaga parecida com esta entra no ar, você é avisado por
        e-mail na hora — não precisa voltar aqui pra procurar de novo.
      </div>
      <a
        href={SIGNUP_NEXT_MONITOR}
        style={{
          display: "inline-block",
          background: "#c6ff3a",
          color: "#1c2a05",
          borderRadius: 10,
          padding: "15px 28px",
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Ativar Monitor grátis
      </a>
    </div>
  );
}

function CompatCardShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "#0a0a0a",
        borderRadius: 14,
        padding: "22px 22px 20px",
        fontFamily: GEIST,
        color: "#fafaf6",
      }}
    >
      {children}
    </div>
  );
}

function CompatCardCta({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <CompatCardShell>
      <CompatHead />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "8px 0 4px",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            border: "1.5px dashed rgba(250,250,246,0.15)",
            marginBottom: 14,
          }}
        />
        <p style={{ fontSize: 13.5, fontWeight: 500, margin: "0 0 6px" }}>
          {title}
        </p>
        <p style={{ fontSize: 12, color: "#8a8a85", margin: "0 0 16px" }}>
          {description}
        </p>
        <a
          href={href}
          style={{
            background: "#fafaf6",
            color: "#0a0a0a",
            borderRadius: 9,
            padding: "11px 16px",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            display: "block",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {linkLabel} →
        </a>
      </div>
    </CompatCardShell>
  );
}

// Card #1 da sidebar pra visitante anônimo — Monitor como CTA principal,
// no lugar do antigo "Cadastre-se para ver sua oportunidade" (genérico e
// sem prova de valor). Fica acima do card de Candidatura, que continua
// intacto (AnalysisCtaButtons, aplicação externa, salvar) logo abaixo.
function MonitorPrimaryCard() {
  const benefits = [
    "Novas vagas parecidas assim que entram no ar",
    "Compatibilidade calculada em cada uma",
    "CV adaptado com um clique quando você quiser aplicar",
  ];

  return (
    <CompatCardShell>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: -0.3,
          marginBottom: 14,
        }}
      >
        O que você ganha com o Monitor:
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 11,
          marginBottom: 20,
        }}
      >
        {benefits.map((text) => (
          <div
            key={text}
            style={{ display: "flex", gap: 9, alignItems: "flex-start" }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <title>Incluído</title>
              <path
                d="M5 13l4 4L19 7"
                stroke="#c6ff3a"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ fontSize: 12.5, color: "#e8e6df" }}>{text}</span>
          </div>
        ))}
      </div>
      <a
        href={SIGNUP_NEXT_MONITOR}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          boxSizing: "border-box",
          background: "#c6ff3a",
          color: "#1c2a05",
          borderRadius: 9,
          padding: "14px 16px",
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
          marginBottom: 10,
        }}
      >
        Ativar Monitor grátis
      </a>
      <div
        style={{
          textAlign: "center",
          fontFamily: MONO,
          fontSize: 10.5,
          color: "#6a6560",
        }}
      >
        grátis · sem cartão · 30s pra configurar
      </div>
    </CompatCardShell>
  );
}

function CompatCard({
  scoreState,
  match,
  existingApplication,
}: {
  scoreState: ScoreState;
  match: MatchData | null;
  existingApplication: ExistingApplicationDto;
}) {
  if (
    existingApplication &&
    typeof existingApplication.bestScore === "number"
  ) {
    return (
      <CompatCardShell>
        <CompatHead isAnalysis />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            paddingBottom: 4,
          }}
        >
          <ScoreRing value={existingApplication.bestScore} size={88} dark />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12.5,
                fontWeight: 600,
                color: "#4ade80",
              }}
            >
              score da sua análise
            </span>
            <span style={{ fontSize: 11.5, color: "#a8a6a0" }}>
              Calculado a partir do CV que você usou nesta candidatura.
            </span>
          </div>
        </div>
      </CompatCardShell>
    );
  }

  if (scoreState === "anonymous") {
    return <MonitorPrimaryCard />;
  }

  if (scoreState === "no-cv") {
    return (
      <CompatCardCta
        title="Suba seu CV para ver sua oportunidade"
        description="O score é calculado com base no seu CV Master."
        href="/meu-cv-master"
        linkLabel="Enviar CV"
      />
    );
  }

  if (!match) {
    return (
      <CompatCardCta
        title="Seu CV está sendo processado"
        description="Assim que terminar, esta vaga ganha uma classificação de oportunidade com seu perfil."
        href="/meu-cv-master"
        linkLabel="Ver status"
      />
    );
  }

  const topSkills = [
    ...match.matchedSkills.map((s) => ({ label: s, have: true })),
    ...match.missingSkills.map((s) => ({ label: s, have: false })),
  ].slice(0, 10);

  return (
    <CompatCardShell>
      <CompatHead />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 20,
          paddingBottom: 18,
          borderBottom: "1px solid rgba(250,250,246,0.08)",
        }}
      >
        <OpportunityRing score={match.score} size={88} dark />
        <OpportunityBadge score={match.score} size="lg" dark />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: topSkills.length > 0 ? 20 : 0,
        }}
      >
        {BREAKDOWN_ROWS.map((row) => {
          const pct = breakdownPct(row.key, match.breakdown[row.key]);
          return (
            <div
              key={row.key}
              style={{ display: "flex", flexDirection: "column", gap: 3 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 12, color: "#c8c6bf" }}>
                  {row.label}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: "#8a8a85",
                    fontWeight: 500,
                  }}
                >
                  {pct}%
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  background: "rgba(250,250,246,0.08)",
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(0, Math.min(100, pct))}%`,
                    background: scoreColor(pct),
                    borderRadius: 99,
                  }}
                />
              </div>
              <span style={{ fontSize: 10.5, color: "#8a8a85" }}>
                {dimensionDescription(row.key, pct, match)}
              </span>
            </div>
          );
        })}
      </div>
      {topSkills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {topSkills.map((s) => (
            <SkillChip key={s.label} label={s.label} have={s.have} dark />
          ))}
        </div>
      ) : null}
    </CompatCardShell>
  );
}

function sanitizeJobHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

type JobSection = { title: string; bodyHtml: string };

function splitHtmlSections(descriptionHtml: string): JobSection[] {
  const safeHtml = sanitizeJobHtml(descriptionHtml ?? "");
  const sectionRegex = /<section>\s*<h2>(.*?)<\/h2>([\s\S]*?)<\/section>/gi;
  const sections: JobSection[] = [];

  let match = sectionRegex.exec(safeHtml);
  while (match) {
    const [, title, bodyHtml] = match;
    if (title?.trim() && bodyHtml?.trim()) {
      sections.push({ title: title.trim(), bodyHtml: bodyHtml.trim() });
    }
    match = sectionRegex.exec(safeHtml);
  }

  return sections.length > 0
    ? sections
    : [{ title: "Descrição da vaga", bodyHtml: safeHtml }];
}

async function loadJob(slug: string) {
  try {
    return await getPublicJobBySlug(slug);
  } catch {
    return null;
  }
}

// Valores normalizados pelos adapters de ingestão (ver
// apps/api/src/ingestion/adapters/gupy.adapter.ts EMPLOYMENT_TYPE_MAP) —
// não são "CLT"/"PJ" literais. talent_pool não é um tipo de contrato real
// (é banco de talentos), por isso fica de fora do mapa e o campo é omitido.
const SCHEMA_EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "FULL_TIME",
  contractor: "CONTRACTOR",
  pj: "CONTRACTOR",
  autonomous: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
  apprentice: "INTERN",
};

function toSchemaEmploymentType(value: string | null): string | undefined {
  if (!value) return undefined;
  return SCHEMA_EMPLOYMENT_TYPE[value];
}

// Rótulo pra exibir no badge/card — mesmo valor normalizado acima (snake_
// case), só formatado pra leitura ("full_time" -> "Full time"). "pj" fica
// em caixa alta (sigla), o resto vira frase com só a primeira letra maiúscula.
const EMPLOYMENT_TYPE_DISPLAY_OVERRIDES: Record<string, string> = {
  pj: "PJ",
};

function formatEmploymentType(value: string): string {
  const override = EMPLOYMENT_TYPE_DISPLAY_OVERRIDES[value];
  if (override) return override;
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export async function generateMetadata({
  params,
}: JobPageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = await loadJob(slug);

  if (!job) {
    return {
      title: "Vaga não encontrada",
      robots: { index: false, follow: false },
    };
  }

  const techTags = (job.technologies ?? []).slice(0, 3).join(", ");

  const title = `${job.title} — ${job.company} | EarlyCV`;
  const description = [
    `Vaga de ${job.title} na ${job.company}`,
    job.location ? `em ${job.location}` : null,
    job.workModel === "remote" ? "(Remoto)" : null,
    techTags ? `· ${techTags}` : null,
    "— Veja compatibilidade com seu perfil e adapte seu CV em segundos.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 160);
  const url = getAbsoluteUrl(`/radar/${job.slug}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title, description },
    twitter: { title, description },
  };
}

function SimCard({
  job,
  showMatchLock = false,
}: {
  job: PublicJob;
  showMatchLock?: boolean;
}) {
  return (
    <RadarOpportunityLink
      href={`/radar/${job.slug}`}
      jobId={job.id}
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "16px 18px",
        textDecoration: "none",
        display: "block",
        color: "#0a0a0a",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <CompanyLogo
          name={job.company}
          logoUrl={job.companyLogoUrl}
          websiteUrl={job.companyWebsiteUrl}
          size={32}
          borderRadius={7}
          fontSize={11}
        />
        {showMatchLock ? (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LockIcon />
          </div>
        ) : (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 14,
              fontWeight: 600,
              color: "#8a8a85",
            }}
          >
            —
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: -0.2,
          color: "#0a0a0a",
          marginBottom: 4,
          lineHeight: 1.35,
        }}
      >
        {job.title}
      </div>
      <div style={{ fontSize: 12, color: "#6a6560", marginBottom: 16 }}>
        {job.company}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#3a3a38",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            textDecorationColor: "rgba(10,10,10,0.2)",
          }}
        >
          ver vaga →
        </span>
      </div>
    </RadarOpportunityLink>
  );
}

export default async function JobPage({ params }: JobPageProps) {
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  const { slug } = await params;
  const job = await loadJob(slug);

  if (!job) notFound();

  let hasCvMaster = false;
  let masterResumeId: string | null = null;
  let match: MatchData | null = null;
  let existingApplication: ExistingApplicationDto = null;
  let isSaved = false;
  let availableCredits: number | "∞" | "—" | undefined;
  if (user) {
    const [master, matchScore, plan] = await Promise.all([
      getMyMasterResume().catch(() => null),
      getJobMatchScore(job.slug),
      getMyPlan().catch(() => null),
    ]);
    hasCvMaster = !!master;
    masterResumeId = master?.id ?? null;
    if (typeof matchScore?.score === "number" && matchScore.breakdown) {
      match = {
        score: matchScore.score,
        breakdown: matchScore.breakdown,
        matchedSkills: matchScore.matchedSkills,
        missingSkills: matchScore.missingSkills,
      };
    }
    existingApplication = matchScore?.existingApplication ?? null;
    isSaved = !!matchScore?.isSaved;
    availableCredits = toHeaderAvailableCredits(plan);
  }

  const scoreState: ScoreState = !user
    ? "anonymous"
    : hasCvMaster
      ? "has-cv"
      : "no-cv";

  const hasExistingAnalysisScore =
    typeof existingApplication?.bestScore === "number";

  const adaptarHref = user ? "/adaptar" : "/entrar?tab=cadastrar&ctx=radar";
  const adaptarJobHref = `${adaptarHref}${adaptarHref.includes("?") ? `&jobId=${job.id}` : `?jobId=${job.id}`}`;

  const sections = splitHtmlSections(job.descriptionHtml);
  const titleParts = splitJobTitleForDisplay(job.title);

  const workModelLabel = job.workModel
    ? (WORK_MODEL_LABELS[job.workModel] ?? job.workModel)
    : null;

  const seniorityLabel = job.seniorityLevel
    ? (SENIORITY_LABELS[job.seniorityLevel.toLowerCase()] ?? job.seniorityLevel)
    : null;

  const publishedDate = job.publishedAtSource
    ? new Date(job.publishedAtSource).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  const isRecentlyPublished =
    !!job.publishedAtSource &&
    Date.now() - new Date(job.publishedAtSource).getTime() < 3 * 86_400_000;

  const similarJobs = await listPublicJobs({ limit: 4, page: 1 })
    .then((r) => r.data.filter((j) => j.slug !== job.slug).slice(0, 3))
    .catch(() => [] as PublicJob[]);

  const validThrough = new Date(
    new Date(job.lastSeenAt).getTime() + 30 * 86_400_000,
  ).toISOString();

  const internalLinks: Array<{ href: string; label: string }> = [];
  if (job.dominantArea) {
    internalLinks.push({
      href: `/radar/area/${job.dominantArea.toLowerCase()}`,
      label: `← Todas as vagas de ${RADAR_AREA_LABELS[job.dominantArea] ?? job.dominantArea}`,
    });
  }
  if (job.company) {
    internalLinks.push({
      href: `/radar/empresa/${toCompanySlug(job.company)}`,
      label: `Vagas na ${job.company}`,
    });
  }
  if (job.workModel === "remote") {
    internalLinks.push({ href: "/radar/remotas", label: "Ver vagas remotas" });
  }

  // job.city/job.state já vêm normalizados (geo-normalizer.ts, na
  // ingestão) — city em title case, state como sigla de UF. addressCountry
  // fixo "BR" porque hoje 100% das vagas publicáveis são do Brasil. Sem
  // cidade nem estado, jobLocation inteiro é omitido — nunca inventar
  // localização só pra preencher o schema.
  const hasStructuredLocation = !!(job.city || job.state);
  const jobLocation = hasStructuredLocation
    ? {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          ...(job.city ? { addressLocality: job.city } : {}),
          ...(job.state ? { addressRegion: job.state } : {}),
          addressCountry: "BR",
        },
      }
    : undefined;

  const jobJsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    // Vaga sem descriptionClean nunca chega aqui em teoria — a query
    // pública já exige título+descrição não vazios — mas o fallback evita
    // um JobPosting com description: "" reprovando no Rich Results Test se
    // essa premissa mudar.
    description:
      job.description.trim() ||
      `Vaga de ${job.title} na ${job.company}. Candidate-se e adapte seu CV com IA.`,
    datePosted: job.publishedAtSource ?? job.firstSeenAt,
    validThrough,
    employmentType: toSchemaEmploymentType(job.employmentType),
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
      ...(job.companyWebsiteUrl ? { sameAs: job.companyWebsiteUrl } : {}),
    },
    ...(jobLocation ? { jobLocation } : {}),
    ...(job.workModel === "remote" ? { jobLocationType: "TELECOMMUTE" } : {}),
    applicantLocationRequirements: { "@type": "Country", name: "Brasil" },
    directApply: true,
    url: getAbsoluteUrl(`/radar/${job.slug}`),
    ...(job.externalJobId
      ? {
          identifier: {
            "@type": "PropertyValue",
            name: "EarlyCV",
            value: job.externalJobId,
          },
        }
      : {}),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Vagas",
        item: getAbsoluteUrl("/radar"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: job.title,
        item: getAbsoluteUrl(`/radar/${job.slug}`),
      },
    ],
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 80% 50% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        fontFamily: GEIST,
        color: "#0a0a0a",
        position: "relative",
      }}
    >
      <script type="application/ld+json">{JSON.stringify(jobJsonLd)}</script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <JobDetailViewTracker jobId={job.id} />

      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.5,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: GRAIN,
        }}
      />

      <PublicNavBar
        hideHowItWorksLink
        hideJobsLink
        fixed
        userName={user?.name}
        userRole={user?.internalRole}
        credits={availableCredits}
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "108px clamp(16px,4vw,48px) 80px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="job-breadcrumb"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#8a8a85",
            letterSpacing: 0.3,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/radar"
            style={{ color: "#5a5a55", textDecoration: "none", flexShrink: 0 }}
          >
            Vagas
          </Link>
          <span style={{ color: "#c8c6bf", flexShrink: 0 }}>›</span>
          <span className="job-breadcrumb-title" style={{ color: "#0a0a0a" }}>
            {job.title}
          </span>
        </nav>

        {/* Internal linking — discreto, contextual às landing pages de SEO
        (área/empresa/remotas). job.dominantArea vem do enrichment
        (JobEnrichment), pode ser null pra vagas ainda sem enriquecimento
        completo — nesse caso o link de área simplesmente não entra na
        lista. job.company é sempre preenchido, então o link de empresa
        aparece pra toda vaga. */}
        {internalLinks.length > 0 ? (
          <div
            className="job-internal-links"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              fontFamily: MONO,
              fontSize: 11,
              marginBottom: 20,
              marginTop: -8,
            }}
          >
            {internalLinks.map((link, index) => (
              <Fragment key={link.href}>
                {index > 0 ? (
                  <span
                    className="job-internal-links-sep"
                    style={{ color: "#c8c6bf" }}
                  >
                    |
                  </span>
                ) : null}
                <Link
                  href={link.href}
                  style={{ color: "#6a6560", textDecoration: "none" }}
                >
                  {link.label}
                </Link>
              </Fragment>
            ))}
          </div>
        ) : null}

        <style>{`
          @media (max-width: 640px) {
            /* Long job titles ("Product Owner | Scrum Master - Pleno")
             * wrapped across 2-3 lines right under "Vagas ›", and the
             * internal-links row below it wrapped mid-sentence leaving a
             * "|" separator dangling at the end of a line — both read as
             * disorganized clutter before the reader even reaches the job
             * header. Truncate the breadcrumb title to one line and stack
             * the internal links vertically (no separators needed once
             * each is on its own line). */
            .job-breadcrumb-title {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              min-width: 0;
            }
            .job-internal-links {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 6px !important;
            }
            .job-internal-links-sep {
              display: none !important;
            }
          }
        `}</style>

        {/* Job header */}
        <header style={{ marginBottom: 32 }}>
          {/* Company row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 22,
            }}
          >
            <CompanyLogo
              name={job.company}
              logoUrl={job.companyLogoUrl}
              websiteUrl={job.companyWebsiteUrl}
              size={44}
              borderRadius={10}
              fontSize={13}
            />
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                  marginBottom: 2,
                }}
              >
                {job.company}
              </div>
              {job.location ? (
                <div style={{ fontSize: 12, color: "#6a6560" }}>
                  {job.location}
                </div>
              ) : null}
            </div>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: "clamp(1.75rem,4vw,2.75rem)",
              fontWeight: 500,
              letterSpacing: -1.6,
              lineHeight: 1.05,
              marginBottom: 20,
              color: "#0a0a0a",
              maxWidth: 760,
            }}
          >
            {titleParts.emphasis ? (
              <>
                {titleParts.lead}
                <br />
                <em
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 400,
                    fontStyle: "italic",
                    color: "#3a3a38",
                  }}
                >
                  {titleParts.emphasis}.
                </em>
              </>
            ) : (
              titleParts.lead
            )}
          </h1>

          {/* Badges */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 26,
              alignItems: "center",
            }}
          >
            {workModelLabel ? (
              <span
                style={{
                  background: "#c6ff3a",
                  color: "#405410",
                  fontFamily: MONO,
                  fontSize: 10.5,
                  padding: "4px 10px",
                  borderRadius: 5,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                }}
              >
                {workModelLabel}
              </span>
            ) : null}
            {seniorityLabel ? (
              <span
                style={{
                  background: "rgba(10,10,10,0.05)",
                  color: "#3a3a38",
                  fontFamily: MONO,
                  fontSize: 10.5,
                  padding: "4px 9px",
                  borderRadius: 5,
                }}
              >
                {seniorityLabel}
              </span>
            ) : null}
            {job.employmentType ? (
              <span
                style={{
                  background: "#fafaf6",
                  color: "#3a3a38",
                  border: "1px solid rgba(10,10,10,0.1)",
                  fontFamily: MONO,
                  fontSize: 10.5,
                  padding: "4px 9px",
                  borderRadius: 5,
                }}
              >
                {formatEmploymentType(job.employmentType)}
              </span>
            ) : null}
          </div>

          {/* Meta cards */}
          <style>{`
            .job-meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; }
            @media (max-width: 640px) {
              .job-meta-grid { grid-template-columns: repeat(2, 1fr); }
            }
          `}</style>
          <div className="job-meta-grid">
            {[
              {
                k: "LOCALIZAÇÃO",
                v: job.location ?? "Não informado",
                sub: null,
                highlight: false,
              },
              {
                k: "MODELO",
                v: workModelLabel ?? "Não informado",
                sub: null,
                highlight: false,
              },
              {
                k: "PUBLICADA",
                v: publishedDate ?? "Não informado",
                sub: isRecentlyPublished ? "recém publicada" : null,
                highlight: isRecentlyPublished,
              },
              {
                k: "PRIMEIRA CAPTURA",
                v: new Date(job.firstSeenAt).toLocaleDateString("pt-BR"),
                sub: "EarlyCV",
                mono: true,
                highlight: false,
              },
            ].map((item) => (
              <div
                key={item.k}
                style={{
                  background: item.highlight
                    ? "rgba(198,255,58,0.1)"
                    : "#fafaf6",
                  border: `1px solid ${item.highlight ? "rgba(64,84,16,0.18)" : "rgba(10,10,10,0.08)"}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                }}
              >
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: 1.2,
                    color: "#8a8a85",
                    margin: "0 0 6px",
                    fontWeight: 500,
                  }}
                >
                  {item.k}
                </p>
                <p
                  style={{
                    fontSize: "mono" in item ? 13 : 14,
                    fontWeight: 500,
                    letterSpacing: -0.3,
                    color: "#0a0a0a",
                    margin: "0 0 2px",
                    fontFamily: "mono" in item ? MONO : GEIST,
                  }}
                >
                  {item.v}
                </p>
                {item.sub ? (
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#8a8a85",
                      margin: 0,
                    }}
                  >
                    {item.sub}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </header>

        {/* Gate de compatibilidade acima da dobra — só visitante anônimo;
        usuário logado já vê o CompatCard real na sidebar, não precisa do
        placeholder */}
        {!user ? <MonitorGateBand /> : null}

        {/* Two-column body */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 340px",
            gap: 28,
            alignItems: "start",
          }}
          className="vagas-detail-grid"
        >
          <style>{`
            @media (max-width: 900px) {
              .vagas-detail-grid { grid-template-columns: 1fr !important; }
            }
            .job-prose ul, .job-prose ol { padding-left: 20px; margin: 10px 0; }
            .job-prose li { margin-bottom: 4px; }
            .job-prose p { margin: 0 0 12px; }
            .job-prose strong { font-weight: 600; }
          `}</style>

          {/* Description */}
          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 14,
              padding: "clamp(20px,4vw,30px)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
            }}
          >
            {sections.map((section, idx) => (
              <div
                key={section.title}
                style={{
                  borderTop: idx > 0 ? "1px solid rgba(10,10,10,0.07)" : "none",
                  paddingTop: idx > 0 ? 28 : 0,
                  marginBottom: 28,
                }}
              >
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: -0.3,
                    margin: "0 0 14px",
                    color: "#0a0a0a",
                  }}
                >
                  {section.title}
                </h2>
                <div
                  className="job-prose"
                  style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized above
                  dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
                />
              </div>
            ))}

            {/* Vitrine do resto da plataforma — só visitante anônimo */}
            {!user ? <FeatureShowcaseStrip /> : null}
          </div>

          {/* Sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Compat card */}
            <CompatCard
              scoreState={scoreState}
              match={match}
              existingApplication={existingApplication}
            />

            {/* Distinção match (Radar) vs. análise (CV Adaptation) — texto só
                aparece quando há score de oportunidade pra explicar e ainda
                não existe uma análise real (nesse caso o card já mostra o
                score real, a distinção deixa de fazer sentido) */}
            {match && !hasExistingAnalysisScore ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: "#8a8a85",
                }}
              >
                Indica o quanto esta vaga combina com seu perfil. É diferente do
                score da análise do currículo.
              </p>
            ) : null}

            {/* Candidatura card */}
            <div
              style={{
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: 1.4,
                  color: "#8a8a85",
                  fontWeight: 500,
                  marginBottom: 12,
                }}
              >
                CANDIDATURA
              </div>
              {hasExistingAnalysisScore && existingApplication ? (
                <a
                  href={`/candidaturas/${existingApplication.id}`}
                  data-testid="view-application-btn"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    boxSizing: "border-box",
                    background: "#0a0a0a",
                    color: "#fafaf6",
                    border: "none",
                    borderRadius: 8,
                    padding: "13px 18px",
                    fontSize: 13.5,
                    fontWeight: 500,
                    textDecoration: "none",
                    fontFamily: GEIST,
                    marginBottom: 8,
                  }}
                >
                  Ver minha candidatura
                  <span style={{ opacity: 0.6, fontFamily: MONO }}>
                    · {Math.round(existingApplication.bestScore as number)}%
                  </span>
                </a>
              ) : (
                <AnalysisCtaButtons
                  isLoggedIn={!!user}
                  masterResumeId={masterResumeId}
                  radarJobId={job.id}
                  jobDescriptionText={job.description}
                  score={match?.score}
                  secondaryHref={adaptarJobHref}
                />
              )}
              {!user || !hasExistingAnalysisScore ? (
                <ExternalApplyGate
                  href={job.sourceJobUrl}
                  company={job.company}
                  jobId={job.id}
                  isAuthenticated={!!user}
                />
              ) : (
                <a
                  href={job.sourceJobUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    width: "100%",
                    display: "block",
                    background: "#fff",
                    color: "#0a0a0a",
                    border: "1px solid rgba(10,10,10,0.15)",
                    borderRadius: 9,
                    padding: "11px",
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                    textAlign: "center",
                    fontFamily: GEIST,
                    marginBottom: 8,
                    boxSizing: "border-box",
                  }}
                >
                  Candidatar-se externamente ↗
                </a>
              )}
              <SaveJobTextBtn
                jobId={job.id}
                initialSaved={isSaved}
                isLoggedIn={!!user}
              />
            </div>

            {/* Job details card */}
            <div
              style={{
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: 1.4,
                  color: "#8a8a85",
                  fontWeight: 500,
                  marginBottom: 12,
                }}
              >
                DETALHES
              </div>
              <dl style={{ margin: 0 }}>
                {(
                  [
                    { label: "Empresa", value: job.company },
                    job.location
                      ? { label: "Localização", value: job.location }
                      : null,
                    workModelLabel
                      ? { label: "Modelo", value: workModelLabel }
                      : null,
                    job.employmentType
                      ? {
                          label: "Contrato",
                          value: formatEmploymentType(job.employmentType),
                        }
                      : null,
                    {
                      label: "Fonte",
                      value: new URL(job.sourceJobUrl).hostname.replace(
                        /^www\./,
                        "",
                      ),
                      link: job.sourceJobUrl,
                    },
                  ] as (null | {
                    label: string;
                    value: string;
                    link?: string;
                  })[]
                )
                  .filter(
                    (
                      item,
                    ): item is {
                      label: string;
                      value: string;
                      link?: string;
                    } => item !== null,
                  )
                  .map((item, idx, arr) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 14,
                        padding: "8px 0",
                        borderBottom:
                          idx < arr.length - 1
                            ? "1px solid rgba(10,10,10,0.05)"
                            : "none",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "#6a6560" }}>
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          color: "#0a0a0a",
                          fontWeight: 500,
                          textAlign: "right",
                        }}
                      >
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: "#3a3a38",
                              textDecoration: "underline",
                              textUnderlineOffset: 3,
                              textDecorationColor: "rgba(10,10,10,0.2)",
                            }}
                          >
                            {item.value} ↗
                          </a>
                        ) : (
                          item.value
                        )}
                      </span>
                    </div>
                  ))}
              </dl>
            </div>
          </aside>
        </div>

        {/* Similar jobs */}
        {similarJobs.length > 0 ? (
          <div style={{ marginTop: 36 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: 1.4,
                    color: "#8a8a85",
                    marginBottom: 5,
                    fontWeight: 500,
                  }}
                >
                  SIMILARES
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 500,
                    letterSpacing: -0.6,
                    color: "#0a0a0a",
                  }}
                >
                  Outras vagas recentes
                </div>
              </div>
              <Link
                href="/radar"
                style={{
                  fontFamily: MONO,
                  fontSize: 11.5,
                  color: "#3a3a38",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textDecorationColor: "rgba(10,10,10,0.2)",
                }}
              >
                ver todas →
              </Link>
            </div>
            <style>{`
              .job-similar-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
              @media (max-width: 900px) {
                .job-similar-grid { grid-template-columns: 1fr; }
              }
            `}</style>
            <div className="job-similar-grid">
              {similarJobs.map((j) => (
                <SimCard key={j.id} job={j} showMatchLock={!user} />
              ))}
            </div>

            {/* Destaque grande do Monitor — só visitante anônimo */}
            {!user ? <MonitorHighlightBand /> : null}
          </div>
        ) : null}
      </div>

      <PublicFooter />
    </main>
  );
}
