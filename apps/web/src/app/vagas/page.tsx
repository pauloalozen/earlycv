import type { Metadata } from "next";
import Link from "next/link";

import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  getPublicJobFacets,
  listPublicJobs,
  type PublicJob,
} from "@/lib/public-jobs-api";
import { getMyMasterResume } from "@/lib/resumes-api";
import { getAbsoluteUrl } from "@/lib/site";
import { type ActiveFilters, FiltersSidebar } from "./filters-sidebar";
import { JobScoreWidget, type ScoreState } from "./job-score-widget";

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

const CATEGORIES = [
  { value: "todas", label: "todas" },
  { value: "engenharia", label: "engenharia" },
  { value: "produto", label: "produto" },
  { value: "dados", label: "dados" },
  { value: "analytics", label: "analytics" },
  { value: "design", label: "design" },
  { value: "remoto", label: "remoto" },
];

const COMPANY_COLORS = [
  "#3a7ff6",
  "#a855f7",
  "#06b6d4",
  "#f97316",
  "#22c55e",
  "#ec4899",
  "#eab308",
];

type SearchParams = {
  q?: string;
  area?: string;
  modalidade?: string;
  senioridade?: string;
  empresa?: string;
  publicada?: string;
  page?: string;
};

export function generateMetadata(): Metadata {
  const url = getAbsoluteUrl("/vagas");
  return {
    title: "Vagas de tecnologia e dados | EarlyCV",
    description:
      "Vagas em tecnologia, dados, produto e áreas digitais monitoradas pelo EarlyCV — chegam antes do LinkedIn.",
    alternates: { canonical: url },
    robots: { index: true, follow: true },
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

function getCompanyColor(name: string): string {
  return COMPANY_COLORS[name.charCodeAt(0) % COMPANY_COLORS.length];
}

function CompanyLogo({ name }: { name: string }) {
  return (
    <div
      aria-hidden
      style={{
        width: 42,
        height: 42,
        borderRadius: 9,
        background: getCompanyColor(name),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0,
        flexShrink: 0,
        fontFamily: MONO,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

type JobCardProps = {
  job: PublicJob;
  adaptarHref: string;
  scoreState: ScoreState;
};

function JobCard({ job, adaptarHref, scoreState }: JobCardProps) {
  const early = isEarlyJob(job);
  const published = job.publishedAtSource ?? job.firstSeenAt;
  const workModelLabel = job.workModel
    ? (WORK_MODEL_LABELS[job.workModel] ?? job.workModel)
    : null;
  const seniorityLabel = job.seniorityLevel
    ? (SENIORITY_LABELS[job.seniorityLevel.toLowerCase()] ?? job.seniorityLevel)
    : null;
  const adaptarUrl = adaptarHref.includes("?")
    ? `${adaptarHref}&jobId=${job.id}`
    : `${adaptarHref}?jobId=${job.id}`;

  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "16px 18px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        fontFamily: GEIST,
      }}
    >
      {/* Left */}
      <div style={{ display: "flex", gap: 14, flex: 1, minWidth: 0 }}>
        <CompanyLogo name={job.company} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
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

          {/* Company */}
          <div style={{ fontSize: 12.5, color: "#6a6560", marginBottom: 10 }}>
            {job.company}
          </div>

          {/* Tags */}
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

          {/* Meta */}
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
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <title>Tempo</title>
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="#8a8a85"
                  strokeWidth="1.6"
                />
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
        </div>
      </div>

      {/* Right */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 10,
          flexShrink: 0,
          minWidth: 80,
        }}
      >
        {/* Bookmark */}
        <button
          type="button"
          aria-label="Salvar vaga"
          style={{
            width: 28,
            height: 28,
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

        <JobScoreWidget scoreState={scoreState} compact />

        <a
          href={adaptarUrl}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "#0a0a0a",
            color: "#fafaf6",
            border: "none",
            borderRadius: 7,
            padding: "7px 11px",
            fontSize: 11.5,
            fontWeight: 500,
            textDecoration: "none",
            fontFamily: GEIST,
            whiteSpace: "nowrap",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#c6ff3a">
            <title>Adaptar</title>
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
          </svg>
          adaptar CV
        </a>
      </div>
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
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const area = params.area;
  const q = params.q;
  const modalidade = params.modalidade;
  const senioridade = params.senioridade;
  const empresa = params.empresa;
  const publicada = params.publicada;

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

  const [jobsResult, facets, user] = await Promise.all([
    listPublicJobs({
      q: effectiveQ,
      workModel: effectiveModalidade,
      seniorityLevel: senioridade,
      companyName: empresa,
      publishedWithin,
      page,
      limit: 20,
    }),
    getPublicJobFacets().catch(() => null),
    getCurrentAppUserFromCookies().catch(() => null),
  ]);

  let hasCvMaster = false;
  if (user) {
    const master = await getMyMasterResume().catch(() => null);
    hasCvMaster = !!master;
  }

  const scoreState: ScoreState = !user
    ? "anonymous"
    : hasCvMaster
      ? "has-cv"
      : "no-cv";

  const adaptarHref = user ? "/adaptar" : "/entrar?tab=cadastrar";
  const totalPages = Math.ceil(jobsResult.total / jobsResult.limit);

  const activeFilters: ActiveFilters = {
    q: effectiveQ,
    modalidade: effectiveModalidade,
    senioridade,
    empresa,
    publicada,
    area,
  };

  const activeFiltersCount = [
    effectiveModalidade,
    senioridade,
    empresa,
    publicada,
  ].filter(Boolean).length;

  function buildPageUrl(targetPage: number) {
    const p = new URLSearchParams();
    if (effectiveQ) p.set("q", effectiveQ);
    if (effectiveModalidade) p.set("modalidade", effectiveModalidade);
    if (senioridade) p.set("senioridade", senioridade);
    if (empresa) p.set("empresa", empresa);
    if (publicada) p.set("publicada", publicada);
    if (area) p.set("area", area);
    p.set("page", String(targetPage));
    return `?${p.toString()}`;
  }

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
        @media (max-width: 768px) {
          .vagas-layout { grid-template-columns: 1fr !important; }
          .vagas-sidebar { display: none !important; }
        }
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
              marginBottom: 24,
              lineHeight: 1.5,
              margin: "0 0 24px",
            }}
          >
            Envie seu CV uma vez. Chegue primeiro. Adapte em segundos.
          </p>

          {/* Search row */}
          <div
            style={{
              display: "flex",
              gap: 10,
              margin: "28px 0 24px",
            }}
          >
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
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#8a8a85",
                    background: "rgba(10,10,10,0.05)",
                    border: "1px solid rgba(10,10,10,0.08)",
                    borderRadius: 4,
                    padding: "2px 6px",
                    whiteSpace: "nowrap",
                  }}
                >
                  ⌘K
                </span>
              </div>
              <button type="submit" style={{ display: "none" }}>
                Buscar
              </button>
            </form>

            <button
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#fafaf6",
                color: "#0a0a0a",
                border: "1px solid rgba(10,10,10,0.12)",
                borderRadius: 10,
                padding: "0 16px",
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: GEIST,
                whiteSpace: "nowrap",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <title>Filtros</title>
                <path
                  d="M3 5h18M6 12h12M10 19h4"
                  stroke="#0a0a0a"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
              Filtros
              {activeFiltersCount > 0 ? (
                <span
                  style={{
                    background: "#0a0a0a",
                    color: "#fafaf6",
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 0.2,
                    borderRadius: 99,
                    padding: "1px 7px",
                    fontWeight: 500,
                  }}
                >
                  {activeFiltersCount}
                </span>
              ) : null}
            </button>
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

        {/* Two-column layout */}
        <div
          className="vagas-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            gap: 32,
            alignItems: "start",
          }}
        >
          {/* Sidebar */}
          <div className="vagas-sidebar">
            <FiltersSidebar facets={facets} activeFilters={activeFilters} />
          </div>

          {/* Main */}
          <div>
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
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

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    background: "#fafaf6",
                    border: "1px solid rgba(10,10,10,0.1)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "center",
                      background: "#0a0a0a",
                      color: "#fafaf6",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <title>Lista</title>
                      <rect x="3" y="5" width="18" height="3" />
                      <rect x="3" y="11" width="18" height="3" />
                      <rect x="3" y="17" width="18" height="3" />
                    </svg>
                  </span>
                  <span
                    style={{
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "center",
                      color: "#8a8a85",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <title>Grade</title>
                      <rect x="3" y="3" width="8" height="8" />
                      <rect x="13" y="3" width="8" height="8" />
                      <rect x="3" y="13" width="8" height="8" />
                      <rect x="13" y="13" width="8" height="8" />
                    </svg>
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    background: "#fafaf6",
                    border: "1px solid rgba(10,10,10,0.1)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    cursor: "default",
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#8a8a85",
                      letterSpacing: 0.4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ordenar por
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      color: "#0a0a0a",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    mais recentes
                  </span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <title>Expandir</title>
                    <path d="M6 9l6 6 6-6" stroke="#3a3a38" strokeWidth="1.7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Job cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobsResult.data.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  adaptarHref={adaptarHref}
                  scoreState={scoreState}
                />
              ))}

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
        </div>
      </div>

      <PublicFooter />
    </main>
  );
}
