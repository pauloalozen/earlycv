import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  canAccessJobsInGhostMode,
  isJobsGhostModeEnabled,
} from "@/lib/jobs-ghost-mode";
import {
  getPublicJobFacets,
  listPublicJobs,
  type PublicJob,
} from "@/lib/public-jobs-api";
import { getMyRadarProfile } from "@/lib/radar-api";
import { getMyMasterResume } from "@/lib/resumes-api";
import { getAbsoluteUrl } from "@/lib/site";
import { CompanyLogo } from "./company-logo";
import { type ActiveFilters, FiltersBar } from "./filters-bar";
import { AdaptBtn, MiniBar, ScoreRing, SkillChip } from "./radar-ui";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF =
  "var(--font-instrument-serif), 'Instrument Serif', Georgia, serif";
const GRAIN = `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

const PUBLISHED_WITHIN_MAP = {
  hoje: "24h",
  "3dias": "3d",
  semana: "7d",
} as const;

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

const RADAR_AREA_LABELS: Record<string, string> = {
  DATA_AI: "Dados & IA",
  SOFTWARE_ENGINEERING: "Engenharia de Software",
  CLOUD_DEVOPS: "Cloud & DevOps",
  CYBERSECURITY: "Segurança da Informação",
  PRODUCT: "Produto",
  DESIGN_UX: "Design & UX",
  QA_TEST: "QA & Testes",
  PROJECT_AGILE: "Gestão de Projetos",
  ARCHITECTURE: "Arquitetura",
  LEADERSHIP: "Liderança",
  OTHER: "Geral",
};

const RADAR_SENIORITY_LABELS: Record<string, string> = {
  INTERN: "estagiário",
  JUNIOR: "júnior",
  MID: "pleno",
  SENIOR: "sênior",
  LEAD: "lead",
  STAFF: "staff",
  MANAGER: "gerente",
  DIRECTOR: "diretor",
  UNKNOWN: "",
};

const CATEGORIES = [
  { value: "todas", label: "todas" },
  { value: "engenharia", label: "engenharia" },
  { value: "produto", label: "produto" },
  { value: "dados", label: "dados" },
  { value: "analytics", label: "analytics" },
  { value: "design", label: "design" },
  { value: "remoto", label: "remoto" },
];

type SearchParams = {
  q?: string;
  area?: string;
  modalidade?: string;
  senioridade?: string;
  empresa?: string;
  publicada?: string;
  minScore?: string;
  minSkillsPct?: string;
  page?: string;
};

export function generateMetadata(): Metadata {
  const isGhostMode = isJobsGhostModeEnabled();
  const url = getAbsoluteUrl("/vagas");
  return {
    title: "Vagas de tecnologia e dados | EarlyCV",
    description:
      "Vagas em tecnologia, dados, produto e áreas digitais monitoradas pelo EarlyCV — chegam antes do LinkedIn.",
    alternates: { canonical: url },
    robots: { index: !isGhostMode, follow: !isGhostMode },
    openGraph: {
      title: "Vagas | EarlyCV",
      description:
        "Vagas monitoradas antes da divulgação pública. Tecnologia, dados, produto e áreas digitais.",
      url,
      type: "website",
    },
    twitter: {
      title: "Vagas | EarlyCV",
      description:
        "Vagas monitoradas antes da divulgação pública. Tecnologia, dados, produto e áreas digitais.",
    },
  };
}

function isEarlyJob(job: PublicJob): boolean {
  if (!job.publishedAtSource) return false;
  const first = new Date(job.firstSeenAt).getTime();
  const published = new Date(job.publishedAtSource).getTime();
  return first < published + 6 * 3_600_000;
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return "< 1h";
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "1 dia";
  if (diffD < 7) return `${diffD} dias`;
  const diffW = Math.floor(diffD / 7);
  if (diffW === 1) return "1 semana";
  return `${diffW} semanas`;
}

function calibrationPhrase(areas: string[], seniority: string): string | null {
  if (areas.length === 0) return null;
  const areaLabel = areas
    .slice(0, 2)
    .map((a) => RADAR_AREA_LABELS[a] ?? a)
    .join(" & ");
  const seniorityLabel = RADAR_SENIORITY_LABELS[seniority];
  return seniorityLabel ? `${areaLabel} · ${seniorityLabel}` : areaLabel;
}

function JobMetaRow({ job }: { job: PublicJob }) {
  const early = isEarlyJob(job);
  const published = job.publishedAtSource ?? job.firstSeenAt;
  const workModelLabel = job.workModel
    ? (WORK_MODEL_LABELS[job.workModel] ?? job.workModel)
    : null;
  const seniorityLabel = job.seniorityLevel
    ? (SENIORITY_LABELS[job.seniorityLevel.toLowerCase()] ?? job.seniorityLevel)
    : null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 2,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/vagas/${job.slug}`}
          style={{
            fontSize: 15.5,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: "#0a0a0a",
            textDecoration: "none",
            lineHeight: 1.3,
          }}
        >
          {job.title}
        </Link>
        {early ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              background: "#c6ff3a",
              color: "#405410",
              fontFamily: MONO,
              fontSize: 9.5,
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 600,
              letterSpacing: 0.4,
              flexShrink: 0,
            }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="#405410">
              <title>Early</title>
              <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
            </svg>
            early
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 12.5, color: "#6a6560", marginBottom: 10 }}>
        {job.company}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
          marginBottom: 10,
        }}
      >
        {workModelLabel ? (
          <span
            style={{
              background: "rgba(198,255,58,0.22)",
              color: "#405410",
              fontFamily: MONO,
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              letterSpacing: 0.2,
              fontWeight: 500,
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
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              letterSpacing: 0.2,
            }}
          >
            {seniorityLabel}
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11.5,
          color: "#6a6560",
          flexWrap: "wrap",
        }}
      >
        {job.location ? (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <title>Local</title>
              <circle
                cx="12"
                cy="10"
                r="3.2"
                stroke="#8a8a85"
                strokeWidth="1.6"
              />
              <path
                d="M19 10c0 5.5-7 12-7 12s-7-6.5-7-12a7 7 0 0 1 14 0z"
                stroke="#8a8a85"
                strokeWidth="1.6"
              />
            </svg>
            {job.location}
          </span>
        ) : null}
        {job.location ? (
          <span
            style={{
              width: 2,
              height: 2,
              borderRadius: "50%",
              background: "#c8c6bf",
              flexShrink: 0,
            }}
          />
        ) : null}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <title>Tempo</title>
            <circle cx="12" cy="12" r="9" stroke="#8a8a85" strokeWidth="1.6" />
            <path
              d="M12 7v5l3 2"
              stroke="#8a8a85"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          há {formatRelativeTime(published)}
        </span>
      </div>
    </>
  );
}

type JobCardProps = {
  job: PublicJob;
  adaptarHref: string;
  showScore: boolean;
};

// Card full-width: ring de score dominante à direita + breakdown inline +
// chips de skill quando disponíveis. `showScore=false` cobre tanto anônimo
// quanto vaga ainda não enriquecida (score null) — o card fica idêntico,
// só sem a coluna de compatibilidade.
function JobCard({ job, adaptarHref, showScore }: JobCardProps) {
  const hasScore = showScore && typeof job.score === "number";
  const adaptarUrl = adaptarHref.includes("?")
    ? `${adaptarHref}&jobId=${job.id}`
    : `${adaptarHref}?jobId=${job.id}`;

  const topSkills = [
    ...(job.matchedSkills ?? []).map((s) => ({ label: s, have: true })),
    ...(job.missingSkills ?? []).map((s) => ({ label: s, have: false })),
  ].slice(0, 6);

  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        fontFamily: GEIST,
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14, flex: 1, minWidth: 0 }}>
          <CompanyLogo name={job.company} websiteUrl={job.companyWebsiteUrl} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <JobMetaRow job={job} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {hasScore && typeof job.score === "number" ? (
            <ScoreRing value={job.score} size={64} />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: "1.5px dashed rgba(10,10,10,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: "#8a8a85",
                fontFamily: MONO,
                textAlign: "center",
                lineHeight: 1.2,
              }}
            >
              {showScore ? "em análise" : "—"}
            </div>
          )}
        </div>
      </div>

      {hasScore && job.breakdown ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            paddingTop: 12,
            borderTop: "1px solid rgba(10,10,10,0.06)",
          }}
        >
          <MiniBar label="área" value={job.breakdown.area} compact />
          <MiniBar label="skills" value={job.breakdown.skills} compact />
          <MiniBar
            label="senioridade"
            value={job.breakdown.seniority}
            compact
          />
          <MiniBar
            label="tecnologias"
            value={job.breakdown.technologies}
            compact
          />
        </div>
      ) : null}

      {topSkills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {topSkills.map((s) => (
            <SkillChip key={s.label} label={s.label} have={s.have} />
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
          paddingTop: topSkills.length > 0 ? 0 : 4,
        }}
      >
        <button
          type="button"
          aria-label="Salvar vaga"
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            background: "transparent",
            border: "1px solid rgba(10,10,10,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <title>Salvar</title>
            <path
              d="M6 3h12v18l-6-4-6 4V3z"
              stroke="#0a0a0a"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <AdaptBtn href={adaptarUrl} score={hasScore ? job.score : null} />
      </div>
    </div>
  );
}

function JobCardLocked({ job }: { job: PublicJob }) {
  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: 0.75,
        fontFamily: GEIST,
      }}
    >
      <div style={{ display: "flex", gap: 14, flex: 1, minWidth: 0 }}>
        <CompanyLogo name={job.company} websiteUrl={job.companyWebsiteUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <JobMetaRow job={job} />
        </div>
      </div>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: "1.5px dashed rgba(10,10,10,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <title>Bloqueado</title>
          <rect
            x="5"
            y="10"
            width="14"
            height="10"
            rx="2"
            stroke="#a0a098"
            strokeWidth="1.6"
          />
          <path
            d="M8 10V7a4 4 0 0 1 8 0v3"
            stroke="#a0a098"
            strokeWidth="1.6"
          />
        </svg>
      </div>
    </div>
  );
}

function CarouselCard({
  job,
  adaptarHref,
}: {
  job: PublicJob;
  adaptarHref: string;
}) {
  const adaptarUrl = adaptarHref.includes("?")
    ? `${adaptarHref}&jobId=${job.id}`
    : `${adaptarHref}?jobId=${job.id}`;
  if (typeof job.score !== "number") return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(34,163,72,0.2)",
        borderRadius: 12,
        padding: 16,
        minWidth: 240,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CompanyLogo
          name={job.company}
          websiteUrl={job.companyWebsiteUrl}
          size={34}
        />
        <div style={{ minWidth: 0 }}>
          <Link
            href={`/vagas/${job.slug}`}
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 500,
              color: "#0a0a0a",
              textDecoration: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {job.title}
          </Link>
          <span style={{ fontSize: 11, color: "#6a6560" }}>{job.company}</span>
        </div>
      </div>
      <ScoreRing value={job.score} size={56} />
      <AdaptBtn href={adaptarUrl} score={job.score} />
    </div>
  );
}

function categoryHref(areaValue: string, params: SearchParams): string {
  if (areaValue === "todas") return "/vagas";

  const p = new URLSearchParams();
  if (params.publicada) p.set("publicada", params.publicada);
  if (params.senioridade) p.set("senioridade", params.senioridade);
  if (params.empresa) p.set("empresa", params.empresa);

  p.set("area", areaValue);
  if (areaValue === "remoto") {
    p.set("modalidade", "remote");
  }
  return `/vagas?${p.toString()}`;
}

type VagasPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function VagasPage({ searchParams }: VagasPageProps) {
  const isGhostMode = isJobsGhostModeEnabled();
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  if (isGhostMode && !canAccessJobsInGhostMode(user?.internalRole)) {
    notFound();
  }

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const area = params.area;
  const q = params.q;
  const modalidade = params.modalidade;
  const senioridade = params.senioridade;
  const empresa = params.empresa;
  const publicada = params.publicada;
  const minScore = params.minScore;
  const minSkillsPct = params.minSkillsPct;

  let effectiveQ = q;
  let effectiveModalidade = modalidade;
  if (area && area !== "todas" && area !== "remoto" && !q) {
    effectiveQ = area;
  } else if (area === "remoto" && !modalidade) {
    effectiveModalidade = "remote";
  }

  const publishedWithin =
    publicada && publicada in PUBLISHED_WITHIN_MAP
      ? PUBLISHED_WITHIN_MAP[publicada as keyof typeof PUBLISHED_WITHIN_MAP]
      : undefined;

  const [jobsResult, facets] = await Promise.all([
    listPublicJobs({
      q: effectiveQ,
      workModel: effectiveModalidade,
      seniorityLevel: senioridade,
      companyName: empresa,
      publishedWithin,
      page,
      limit: 20,
      minScore: minScore ? Number.parseInt(minScore, 10) : undefined,
      minSkillsPct: minSkillsPct
        ? Number.parseInt(minSkillsPct, 10)
        : undefined,
    }),
    getPublicJobFacets().catch(() => null),
  ]);

  let radarProfile: Awaited<ReturnType<typeof getMyRadarProfile>> = null;
  let cvFileName: string | null = null;
  if (user) {
    const [master, radar] = await Promise.all([
      getMyMasterResume().catch(() => null),
      getMyRadarProfile(),
    ]);
    cvFileName = master?.sourceFileName ?? null;
    radarProfile = radar;
  }

  const hasRadar = !!radarProfile && radarProfile.areas.length > 0;
  const scoreState: "anonymous" | "has-cv" | "no-cv" = !user
    ? "anonymous"
    : hasRadar
      ? "has-cv"
      : "no-cv";

  const radarOnboardingBanner: {
    text: string;
    href: string;
    linkLabel: string;
  } | null = !user
    ? null
    : !radarProfile
      ? {
          text: "Faça upload do seu CV para ver vagas compatíveis com seu perfil.",
          href: "/cv-base",
          linkLabel: "Enviar CV",
        }
      : radarProfile.areas.length === 0
        ? {
            text: "Seu perfil ainda está sendo processado. Envie um CV para ativar o Radar.",
            href: "/cv-base",
            linkLabel: "Enviar CV",
          }
        : null;

  const adaptarHref = user ? "/adaptar" : "/entrar?tab=cadastrar";
  const totalPages = Math.ceil(jobsResult.total / jobsResult.limit);

  const activeFilters: ActiveFilters = {
    q: effectiveQ,
    modalidade: effectiveModalidade,
    senioridade,
    empresa,
    publicada,
    area,
    minScore,
    minSkillsPct,
  };

  function buildPageUrl(targetPage: number) {
    const p = new URLSearchParams();
    if (effectiveQ) p.set("q", effectiveQ);
    if (effectiveModalidade) p.set("modalidade", effectiveModalidade);
    if (senioridade) p.set("senioridade", senioridade);
    if (empresa) p.set("empresa", empresa);
    if (publicada) p.set("publicada", publicada);
    if (area) p.set("area", area);
    if (minScore) p.set("minScore", minScore);
    if (minSkillsPct) p.set("minSkillsPct", minSkillsPct);
    p.set("page", String(targetPage));
    return `?${p.toString()}`;
  }

  const calibration = hasRadar
    ? calibrationPhrase(
        radarProfile?.areas ?? [],
        radarProfile?.seniority ?? "",
      )
    : null;
  const highCompatCount = jobsResult.highCompatCount ?? 0;
  const carouselJobs =
    scoreState === "has-cv"
      ? jobsResult.data.filter(
          (j) => typeof j.score === "number" && j.score >= 70,
        )
      : [];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Vagas de tecnologia e dados — EarlyCV",
    itemListElement: jobsResult.data.map((job, i) => ({
      "@type": "ListItem",
      position: (page - 1) * jobsResult.limit + i + 1,
      url: getAbsoluteUrl(`/vagas/${job.slug}`),
    })),
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
      <script type="application/ld+json">
        {JSON.stringify(itemListJsonLd)}
      </script>
      <style>{`
        .vagas-carousel::-webkit-scrollbar { display: none; }
      `}</style>

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

      <PublicNavBar hideHowItWorksLink fixed />

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "120px clamp(16px,4vw,48px) 80px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {radarOnboardingBanner ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              background: "rgba(198,255,58,0.15)",
              border: "1px solid rgba(64,84,16,0.2)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 20,
              fontSize: 13,
              color: "#3a3a38",
            }}
          >
            <span>{radarOnboardingBanner.text}</span>
            <a
              href={radarOnboardingBanner.href}
              style={{
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 600,
                color: "#0a0a0a",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                whiteSpace: "nowrap",
              }}
            >
              {radarOnboardingBanner.linkLabel} →
            </a>
          </div>
        ) : null}

        {/* Hero */}
        <header style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1.4,
              color: "#5a5a55",
              fontWeight: 500,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#c6ff3a",
                boxShadow: "0 0 0 3px rgba(198,255,58,0.25)",
              }}
            />
            PORTAL DE VAGAS
          </div>
          <h1
            style={{
              fontSize: "clamp(2rem,5vw,3.375rem)",
              fontWeight: 500,
              letterSpacing: -2,
              lineHeight: 1.02,
              margin: "0 0 10px",
              color: "#0a0a0a",
            }}
          >
            Vagas em tech{" "}
            <em
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                fontStyle: "italic",
                color: "#3a3a38",
              }}
            >
              antes de todo mundo.
            </em>
          </h1>
          <p
            style={{
              fontSize: 15.5,
              color: "#5a5a55",
              lineHeight: 1.5,
              margin: "0 0 20px",
            }}
          >
            Envie seu CV uma vez. Chegue primeiro. Adapte em segundos.
          </p>

          {scoreState === "has-cv" && radarProfile ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  background: "rgba(34,163,72,0.1)",
                  border: "1px solid rgba(34,163,72,0.22)",
                  borderRadius: 10,
                  padding: "9px 14px",
                }}
              >
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    color: "#1f7a34",
                    letterSpacing: -0.4,
                  }}
                >
                  {highCompatCount}
                </span>
                <span style={{ fontSize: 12, color: "#3a3a38" }}>
                  altamente compatíveis com você
                </span>
              </div>
              {calibration ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#fafaf6",
                    border: "1px solid rgba(10,10,10,0.1)",
                    borderRadius: 10,
                    padding: "9px 14px",
                    fontSize: 12,
                    color: "#3a3a38",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <title>Radar calibrado</title>
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                      stroke="#0a0a0a"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M12 2v4M12 18v4M2 12h4M18 12h4"
                      stroke="#0a0a0a"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  calibrado para {calibration}
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "#8a8a85",
                  padding: "9px 4px",
                }}
              >
                atualizado há {formatRelativeTime(radarProfile.updatedAt)}
              </div>
            </div>
          ) : null}

          {/* Search row */}
          <div style={{ display: "flex", gap: 10, margin: "8px 0 20px" }}>
            <form
              method="GET"
              action="/vagas"
              aria-label="Buscar vagas"
              style={{ flex: 1, display: "flex" }}
            >
              {effectiveModalidade && effectiveModalidade !== "remote" ? (
                <input
                  type="hidden"
                  name="modalidade"
                  value={effectiveModalidade}
                />
              ) : null}
              {senioridade ? (
                <input type="hidden" name="senioridade" value={senioridade} />
              ) : null}
              {empresa ? (
                <input type="hidden" name="empresa" value={empresa} />
              ) : null}
              {publicada ? (
                <input type="hidden" name="publicada" value={publicada} />
              ) : null}
              {minScore ? (
                <input type="hidden" name="minScore" value={minScore} />
              ) : null}
              {minSkillsPct ? (
                <input type="hidden" name="minSkillsPct" value={minSkillsPct} />
              ) : null}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#fafaf6",
                  border: "1px solid rgba(10,10,10,0.1)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <title>Buscar</title>
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                    stroke="#8a8a85"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M20 20l-3.5-3.5"
                    stroke="#8a8a85"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Cargo, tecnologia, empresa…"
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    fontSize: 14,
                    fontFamily: GEIST,
                    color: "#0a0a0a",
                    outline: "none",
                  }}
                />
              </div>
              <button type="submit" style={{ display: "none" }}>
                Buscar
              </button>
            </form>
          </div>

          {/* Category chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((cat) => {
              const isActive =
                cat.value === "todas"
                  ? !area
                  : area === cat.value ||
                    (cat.value === "remoto" &&
                      effectiveModalidade === "remote" &&
                      !area);
              return (
                <a
                  key={cat.value}
                  href={categoryHref(cat.value, params)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "8px 14px",
                    borderRadius: 99,
                    background: isActive ? "#0a0a0a" : "transparent",
                    color: isActive ? "#fafaf6" : "#3a3a38",
                    border: `1px solid ${isActive ? "#0a0a0a" : "rgba(10,10,10,0.15)"}`,
                    fontSize: 12.5,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    fontFamily: MONO,
                    letterSpacing: 0.2,
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {cat.label}
                </a>
              );
            })}
          </div>
        </header>

        <div style={{ marginBottom: 20 }}>
          <FiltersBar
            facets={facets}
            activeFilters={activeFilters}
            showScoreFilters={scoreState === "has-cv"}
          />
        </div>

        {scoreState === "no-cv" ? (
          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 14,
              padding: "24px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
                  letterSpacing: 0.4,
                  margin: "0 0 8px",
                }}
              >
                ATIVE O RADAR
              </p>
              <p
                style={{ fontSize: 14.5, color: "#3a3a38", margin: "0 0 14px" }}
              >
                {cvFileName
                  ? "Seu CV está sendo processado. Assim que terminar, cada vaga abaixo ganha um score de compatibilidade com seu perfil."
                  : "Envie seu CV e cada vaga abaixo ganha um score de compatibilidade com seu perfil — sem precisar filtrar nada."}
              </p>
              <a
                href="/cv-base"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  fontFamily: GEIST,
                }}
              >
                {cvFileName ? "Ver status" : "Enviar CV"} →
              </a>
            </div>
            <ScoreRing value={68} size={72} />
          </div>
        ) : null}

        {carouselJobs.length > 0 ? (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#2fa84c",
                }}
              />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: 0.4,
                  color: "#3a3a38",
                  textTransform: "uppercase",
                }}
              >
                alta compatibilidade
              </span>
            </div>
            <div
              className="vagas-carousel"
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                paddingBottom: 4,
              }}
            >
              {carouselJobs.map((job) => (
                <CarouselCard
                  key={job.id}
                  job={job}
                  adaptarHref={adaptarHref}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Results header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            paddingBottom: 14,
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  letterSpacing: -0.8,
                  fontFamily: GEIST,
                }}
              >
                {jobsResult.total}
              </span>
              <span style={{ fontSize: 14, color: "#5a5a55" }}>
                {jobsResult.total === 1
                  ? "vaga encontrada"
                  : "vagas encontradas"}
              </span>
            </div>
            {totalPages > 1 ? (
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
                  margin: "4px 0 0",
                  letterSpacing: 0.3,
                }}
              >
                página {page} de {totalPages}
              </p>
            ) : null}
          </div>
        </div>

        {/* Job cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {jobsResult.data.map((job) =>
            scoreState === "no-cv" ? (
              <JobCardLocked key={job.id} job={job} />
            ) : (
              <JobCard
                key={job.id}
                job={job}
                adaptarHref={adaptarHref}
                showScore={scoreState === "has-cv"}
              />
            ),
          )}

          {jobsResult.data.length === 0 ? (
            <div
              style={{
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 14,
                padding: "40px 24px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#8a8a85",
                  margin: "0 0 10px",
                }}
              >
                NENHUMA VAGA ENCONTRADA
              </p>
              <p style={{ fontSize: 14, color: "#5a5a55", margin: 0 }}>
                Tente ajustar os filtros ou buscar por outro termo.
              </p>
            </div>
          ) : null}
        </div>

        {/* Pagination */}
        {totalPages > 1 ? (
          <nav
            aria-label="Paginação"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 14,
              borderTop: "1px solid rgba(10,10,10,0.06)",
              marginTop: 24,
              fontFamily: GEIST,
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: "#8a8a85",
                letterSpacing: 0.2,
              }}
            >
              página {page} de {totalPages} · {jobsResult.total} vagas
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {page > 1 ? (
                <a
                  href={buildPageUrl(page - 1)}
                  style={{
                    fontSize: 12.5,
                    color: "#3a3a38",
                    textDecoration: "none",
                    padding: "6px 10px",
                    borderRadius: 6,
                  }}
                >
                  ← anterior
                </a>
              ) : null}

              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p =
                  totalPages <= 7
                    ? i + 1
                    : page <= 4
                      ? i + 1
                      : page >= totalPages - 3
                        ? totalPages - 6 + i
                        : page - 3 + i;
                return (
                  <a
                    key={p}
                    href={buildPageUrl(p)}
                    style={{
                      minWidth: 28,
                      height: 28,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6,
                      background: p === page ? "#0a0a0a" : "transparent",
                      fontFamily: MONO,
                      fontSize: 11.5,
                      color: p === page ? "#fafaf6" : "#3a3a38",
                      textDecoration: "none",
                      fontWeight: p === page ? 600 : 400,
                    }}
                  >
                    {p}
                  </a>
                );
              })}

              {page < totalPages ? (
                <a
                  href={buildPageUrl(page + 1)}
                  style={{
                    fontSize: 12.5,
                    color: "#3a3a38",
                    textDecoration: "none",
                    padding: "6px 10px",
                    borderRadius: 6,
                  }}
                >
                  próxima →
                </a>
              ) : null}
            </div>
          </nav>
        ) : null}
      </div>

      <PublicFooter />
    </main>
  );
}
