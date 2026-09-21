import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { AnalysisCtaButtons } from "@/app/radar/analysis-cta";
import { CompanyLogo } from "@/app/radar/company-logo";
import { ExternalApplyGate } from "@/app/radar/external-apply-gate";
import { RadarOpportunityLink } from "@/app/radar/radar-opportunity-link";
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
} from "@/app/radar/radar-ui";
import { SaveJobCtaBtn, SaveJobTextBtn } from "@/app/radar/save-job-btn";
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
import { EndOfDescriptionCta } from "../end-of-description-cta";
import { JobDetailViewTrackerV2 } from "../job-detail-view-tracker-v2";
import { MonitorSignupCtaV2 } from "../monitor-signup-cta-v2";
import { RadarV2AnalysisPreviewProvider } from "../radar-analysis-preview-context-v2";
import { RadarGuestAnalysisBandV2 } from "../radar-guest-analysis-band-v2";

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

  // Sem card de Monitor na sidebar — a promoção do Monitor virou o CTA
  // colorido único no meio da página (MonitorSignupCtaV2), não duplicada
  // aqui também.
  if (scoreState === "anonymous") {
    return null;
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
  // /radarv2 é a rota de comparação A/B da Fase 1.1 de conversão — nunca
  // deve ser indexada por conta própria; o canonical aponta pra /radar/[slug]
  // (a versão em produção), então mesmo um crawler que chegue aqui direto
  // trata esta página como duplicata da real.
  const url = getAbsoluteUrl(`/radar/${job.slug}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title, description },
    twitter: { title, description },
    robots: { index: false, follow: false },
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
      href={`/radarv2/${job.slug}`}
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

  // Anônimo: nunca navega direto pro /entrar a partir daqui — sobe pro
  // bloco de análise inline (RadarGuestAnalysisBand, id
  // "radar-guest-analysis") acima da dobra, que já resolve exatamente a
  // mesma vaga (radarJobId=job.id) sem duplicar CTA de análise na mesma
  // página (Fase 1 de conversão do Radar).
  const adaptarHref = user ? "/adaptar" : "#radar-guest-analysis";
  const adaptarJobHref = user ? `${adaptarHref}?jobId=${job.id}` : adaptarHref;

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
      <RadarV2AnalysisPreviewProvider>
        <script type="application/ld+json">{JSON.stringify(jobJsonLd)}</script>
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbJsonLd)}
        </script>
        <JobDetailViewTrackerV2 jobId={job.id} />

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
              style={{
                color: "#5a5a55",
                textDecoration: "none",
                flexShrink: 0,
              }}
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

            {/* Meta info — mesmos 4 dados de sempre (localização, modelo,
          publicação, primeira captura), só que como linha de tags discreta
          em vez de grid de 4 cards grandes: essa informação não é o motivo
          de a pessoa estar aqui, então não deveria disputar espaço com o
          bloco de análise logo abaixo. */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  background: "#fff",
                  border: "1px solid rgba(10,10,10,0.1)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 12,
                  color: "#4a4a45",
                }}
              >
                📍 {job.location ?? "Não informado"}
              </span>
              {workModelLabel ? (
                <span
                  style={{
                    background: "#fff",
                    border: "1px solid rgba(10,10,10,0.1)",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    color: "#4a4a45",
                  }}
                >
                  {workModelLabel}
                </span>
              ) : null}
              {publishedDate ? (
                <span
                  style={{
                    background: isRecentlyPublished
                      ? "rgba(198,255,58,0.14)"
                      : "#fff",
                    border: `1px solid ${isRecentlyPublished ? "rgba(64,84,16,0.2)" : "rgba(10,10,10,0.1)"}`,
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    color: isRecentlyPublished ? "#405410" : "#4a4a45",
                  }}
                >
                  Publicada {publishedDate}
                  {isRecentlyPublished ? " · recém publicada" : ""}
                </span>
              ) : null}
              <span
                style={{
                  background: "#fff",
                  border: "1px solid rgba(10,10,10,0.1)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontFamily: MONO,
                  color: "#8a8a85",
                }}
              >
                capturada em{" "}
                {new Date(job.firstSeenAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
          </header>

          {/* Fase 1 de conversão do Radar — entrada principal de análise
        acima da dobra, só visitante anônimo; usuário logado já vê o
        CompatCard real na sidebar, não precisa deste bloco. */}
          {!user ? (
            <RadarGuestAnalysisBandV2 jobId={job.id} jobTitle={job.title} />
          ) : null}

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
                    borderTop:
                      idx > 0 ? "1px solid rgba(10,10,10,0.07)" : "none",
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

              {/* Reforço de fim de descrição — sempre volta pro mesmo CTA
            principal da vaga (bloco de análise guest no topo, ou o
            CompatCard real na sidebar de quem já está logado). */}
              <EndOfDescriptionCta
                isAuthenticated={!!user}
                hasMasterCv={scoreState === "has-cv"}
              />

              {/* CTA do Monitor — única promoção de Monitor que resta na
            página (sidebar e faixa de rodapé removidas), só anônimo */}
              {!user ? <MonitorSignupCtaV2 /> : null}
            </div>

            {/* Sidebar */}
            <aside
              id="radarv2-compat-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                scrollMarginTop: 24,
              }}
            >
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
                  Indica o quanto esta vaga combina com seu perfil. É diferente
                  do score da análise do currículo.
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
                ) : user ? (
                  <AnalysisCtaButtons
                    isLoggedIn
                    masterResumeId={masterResumeId}
                    radarJobId={job.id}
                    jobDescriptionText={job.description}
                    score={match?.score}
                    secondaryHref={adaptarJobHref}
                  />
                ) : (
                  // Anônimo: o CTA de análise já está em destaque no topo da
                  // página (RadarGuestAnalysisBandV2) — um segundo "Analisar
                  // meu CV" aqui embaixo seria redundante. No lugar dele,
                  // "Salvar para depois" (mesmo ícone/toggle do link que já
                  // existia neste card).
                  <SaveJobCtaBtn
                    jobId={job.id}
                    initialSaved={isSaved}
                    isLoggedIn={false}
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
                {/* Logado: "salvar" já não tem um CTA próprio na sidebar
              (o CTA principal é sempre análise) — mantém o link discreto.
              Anônimo: SaveJobCtaBtn acima já cobre "salvar", sem duplicar. */}
                {user ? (
                  <SaveJobTextBtn
                    jobId={job.id}
                    initialSaved={isSaved}
                    isLoggedIn
                  />
                ) : null}
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
            </div>
          ) : null}
        </div>

        <PublicFooter
          tagline="Tudo que você precisa para conquistar mais entrevistas, em um só lugar."
          ctaLabel="Criar minha conta grátis agora →"
          ctaHref="/entrar?tab=cadastrar&ctx=radar"
        />
      </RadarV2AnalysisPreviewProvider>
    </main>
  );
}
