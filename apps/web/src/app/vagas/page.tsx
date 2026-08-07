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
import { Carousel } from "./carousel";
import { CompanyLogo } from "./company-logo";
import { type ActiveFilters, FiltersBar } from "./filters-bar";
import { JobCard, JobKeywordBadges, JobMetaRow } from "./job-card";
import {
  AdaptBtn,
  MiniBar,
  RADAR_AREA_LABELS,
  RADAR_SENIORITY_LABELS,
  ScorePill,
  ScoreRing,
  SkillChip,
} from "./radar-ui";

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

const SORT_VALUES = [
  "score_desc",
  "score_asc",
  "date_desc",
  "date_asc",
] as const;
type SortValue = (typeof SORT_VALUES)[number];
const SORT_LABELS: Record<SortValue, string> = {
  score_desc: "oportunidade: maior para menor",
  score_asc: "oportunidade: menor para maior",
  date_desc: "data: mais recente",
  date_asc: "data: mais antiga",
};

type SearchParams = {
  q?: string;
  area?: string;
  modalidade?: string;
  senioridade?: string;
  empresa?: string;
  publicada?: string;
  minSkillsPct?: string;
  sort?: string;
  page?: string;
  excludeAnalyzed?: string;
};

export function generateMetadata(): Metadata {
  // export const metadata estático (como no rascunho original da spec)
  // perderia essa condicional — Google indexaria /vagas mesmo com ghost mode
  // ligado, contradizendo o robots.txt. generateMetadata() preserva o
  // comportamento existente, só troca os textos.
  const isGhostMode = isJobsGhostModeEnabled();
  const url = getAbsoluteUrl("/vagas");
  return {
    title: "Vagas em Tech | Radar de Oportunidades — EarlyCV",
    description:
      "Encontre vagas de tecnologia, dados e produto com score de compatibilidade personalizado. Adapte seu CV em segundos.",
    alternates: { canonical: url },
    robots: { index: !isGhostMode, follow: !isGhostMode },
    openGraph: {
      title: "Radar de Oportunidades — Vagas Tech | EarlyCV",
      description: "Vagas de tech com score de compatibilidade para o seu perfil.",
      url,
      type: "website",
    },
    twitter: {
      title: "Radar de Oportunidades — Vagas Tech | EarlyCV",
      description: "Vagas de tech com score de compatibilidade para o seu perfil.",
    },
  };
}

function calibrationPhrase(
  areas: string[],
  seniority: string,
): { area: string; seniority: string } | null {
  if (areas.length === 0) return null;
  const areaLabel = areas
    .slice(0, 2)
    .map((a) => RADAR_AREA_LABELS[a] ?? a)
    .join(" & ");
  const seniorityLabel = RADAR_SENIORITY_LABELS[seniority] || "";
  return { area: areaLabel, seniority: seniorityLabel };
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
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          minWidth: 0,
          flex: "0 1 320px",
        }}
      >
        <CompanyLogo name={job.company} websiteUrl={job.companyWebsiteUrl} />
        <div style={{ minWidth: 0 }}>
          <JobMetaRow job={job} />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginLeft: "auto",
          flexShrink: 0,
        }}
      >
        <JobKeywordBadges job={job} />
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
    </div>
  );
}

// Card de hero pro visitante deslogado — sem conta não há CV pra guardar,
// então ao contrário do card "ATIVE O RADAR" (scoreState "no-cv", que já tem
// conta e só falta enviar o CV), aqui o CTA é criar conta, não enviar
// arquivo. O preview à direita é ilustrativo (dado fixo, não vem da API) —
// mostra o que a pessoa ganha depois de criar a conta e enviar o CV.
function AnonymousHeroCard() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 20,
        marginBottom: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.08)",
          borderRadius: 14,
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(198,255,58,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <title>Criar conta</title>
            <path
              d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
              fill="#405410"
            />
          </svg>
        </div>
        <div>
          <p
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#0a0a0a",
              margin: "0 0 4px",
            }}
          >
            criar conta
          </p>
          <p style={{ fontSize: 13, color: "#5a5a55", margin: 0 }}>
            para ver as melhores oportunidades pro seu perfil
          </p>
        </div>
        <a
          href="/entrar?tab=cadastrar"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#0a0a0a",
            color: "#fafaf6",
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            fontFamily: GEIST,
            marginTop: 4,
          }}
        >
          Criar conta grátis →
        </a>
      </div>

      <div
        style={{
          background: "#f5f4ef",
          border: "1px solid rgba(10,10,10,0.06)",
          borderRadius: 14,
          padding: "22px",
        }}
      >
        <p
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 0.4,
            color: "#8a8a85",
            margin: "0 0 12px",
          }}
        >
          É ASSIM QUE FICA
        </p>
        <div
          style={{
            background: "#fff",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                background: "#0a0a0a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width={22} height={22} viewBox="0 0 40 40" fill="none">
                <title>earlyCV</title>
                <rect x="0" y="0" width="12" height="6.5" rx="2" fill="#fafaf6" />
                <rect x="16" y="0" width="12" height="6.5" rx="2" fill="#fafaf6" />
                <rect x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
                <rect x="0" y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
                <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill="#fafaf6" />
                <rect x="0" y="22.4" width="7" height="6.5" rx="2" fill="#fafaf6" />
                <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
                <rect x="30" y="22.4" width="8" height="6.5" rx="2" fill="#fafaf6" />
                <rect x="0" y="33.5" width="22" height="6.5" rx="2" fill="#fafaf6" />
                <rect
                  x="26"
                  y="33.5"
                  width="9"
                  height="6.5"
                  rx="2"
                  fill="rgba(250,250,246,0.14)"
                />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#0a0a0a",
                  margin: "0 0 2px",
                }}
              >
                Engenheira de software sênior
              </p>
              <p style={{ fontSize: 12, color: "#8a8a85", margin: 0 }}>
                earlyCV
              </p>
            </div>
            <ScoreRing value={92} size={52} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <SkillChip label="Java" have />
            <SkillChip label="Kotlin" have />
            <SkillChip label="PCI-DSS" have={false} />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              paddingTop: 8,
              borderTop: "1px solid rgba(10,10,10,0.06)",
            }}
          >
            <MiniBar label="Skills" value={88} compact />
            <MiniBar label="Senioridade" value={94} compact />
          </div>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "#8a8a85",
            margin: "12px 0 0",
            lineHeight: 1.4,
          }}
        >
          Score, skills e breakdown completo — calculados assim que você cria
          sua conta e envia o CV.
        </p>
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
  const bestAnalysisScore = job.existingApplication?.bestScore;
  const hasAnalysis = typeof bestAnalysisScore === "number";
  const displayScore = hasAnalysis ? bestAnalysisScore : job.score;
  const skills = (job.matchedSkills ?? []).slice(0, 3);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: 16,
        minWidth: 260,
        maxWidth: 260,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
        scrollSnapAlign: "start",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <CompanyLogo
          name={job.company}
          websiteUrl={job.companyWebsiteUrl}
          size={32}
          borderRadius={8}
          fontSize={11}
        />
        <ScorePill value={displayScore} format="label-first" />
      </div>
      <div>
        <Link
          href={`/vagas/${job.slug}`}
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontSize: 13.5,
            fontWeight: 500,
            letterSpacing: -0.2,
            color: "#0a0a0a",
            textDecoration: "none",
            lineHeight: 1.35,
            marginBottom: 4,
          }}
        >
          {job.title}
        </Link>
        <span
          style={{
            display: "block",
            fontSize: 11.5,
            color: "#6a6560",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {job.company} · {job.location}
        </span>
      </div>
      {skills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {skills.map((s) => (
            <SkillChip key={s} label={s} have />
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: "auto", width: "100%" }}>
        {hasAnalysis && job.existingApplication ? (
          <AdaptBtn
            href={`/candidaturas/${job.existingApplication.id}`}
            score={bestAnalysisScore}
            variant="view"
            fullWidth
          />
        ) : (
          <AdaptBtn href={adaptarUrl} score={job.score} fullWidth />
        )}
      </div>
    </div>
  );
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
  const minSkillsPct = params.minSkillsPct;
  const sort: SortValue = SORT_VALUES.includes(params.sort as SortValue)
    ? (params.sort as SortValue)
    : "score_desc";
  // Checkbox vem marcado por padrão — só grava na URL quando desmarcado
  // (excludeAnalyzed=false), então ausência do param == filtro ativo.
  const excludeAnalyzed = params.excludeAnalyzed !== "false";

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
      minSkillsPct: minSkillsPct
        ? Number.parseInt(minSkillsPct, 10)
        : undefined,
      sort,
      excludeAnalyzed,
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
    minSkillsPct,
    sort,
    excludeAnalyzed: excludeAnalyzed ? undefined : "false",
  };

  function buildPageUrl(targetPage: number) {
    const p = new URLSearchParams();
    if (effectiveQ) p.set("q", effectiveQ);
    if (effectiveModalidade) p.set("modalidade", effectiveModalidade);
    if (senioridade) p.set("senioridade", senioridade);
    if (empresa) p.set("empresa", empresa);
    if (publicada) p.set("publicada", publicada);
    if (area) p.set("area", area);
    if (minSkillsPct) p.set("minSkillsPct", minSkillsPct);
    if (sort) p.set("sort", sort);
    if (!excludeAnalyzed) p.set("excludeAnalyzed", "false");
    p.set("page", String(targetPage));
    return `?${p.toString()}`;
  }

  function buildSortUrl(sortValue: SortValue) {
    const p = new URLSearchParams();
    if (effectiveQ) p.set("q", effectiveQ);
    if (effectiveModalidade) p.set("modalidade", effectiveModalidade);
    if (senioridade) p.set("senioridade", senioridade);
    if (empresa) p.set("empresa", empresa);
    if (publicada) p.set("publicada", publicada);
    if (area) p.set("area", area);
    if (minSkillsPct) p.set("minSkillsPct", minSkillsPct);
    if (sortValue !== "score_desc") p.set("sort", sortValue);
    if (!excludeAnalyzed) p.set("excludeAnalyzed", "false");
    const qs = p.toString();
    return `/vagas${qs ? `?${qs}` : ""}`;
  }

  function buildExcludeAnalyzedToggleUrl() {
    const p = new URLSearchParams();
    if (effectiveQ) p.set("q", effectiveQ);
    if (effectiveModalidade) p.set("modalidade", effectiveModalidade);
    if (senioridade) p.set("senioridade", senioridade);
    if (empresa) p.set("empresa", empresa);
    if (publicada) p.set("publicada", publicada);
    if (area) p.set("area", area);
    if (minSkillsPct) p.set("minSkillsPct", minSkillsPct);
    if (sort) p.set("sort", sort);
    if (excludeAnalyzed) p.set("excludeAnalyzed", "false");
    const qs = p.toString();
    return `/vagas${qs ? `?${qs}` : ""}`;
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
        <header style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 36 }}>
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
                marginBottom: 16,
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
              {scoreState === "has-cv"
                ? "RADAR DE OPORTUNIDADES"
                : "PORTAL DE VAGAS"}
            </div>

            {scoreState === "has-cv" && calibration ? (
              <h1
                style={{
                  fontSize: "clamp(1.75rem,4.5vw,2.75rem)",
                  fontWeight: 500,
                  letterSpacing: -1.4,
                  lineHeight: 1.08,
                  margin: "0 0 28px",
                  color: "#0a0a0a",
                }}
              >
                Calibrado para{" "}
                <em
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 400,
                    fontStyle: "italic",
                    color: "#3a3a38",
                  }}
                >
                  {calibration.area}
                </em>
                {calibration.seniority ? ` · ${calibration.seniority}` : null}
              </h1>
            ) : (
              <>
                <h1
                  style={{
                    fontSize: "clamp(2rem,5vw,3.375rem)",
                    fontWeight: 500,
                    letterSpacing: -2,
                    lineHeight: 1.02,
                    margin: "0 0 14px",
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
                    margin: 0,
                  }}
                >
                  Envie seu CV uma vez. Chegue primeiro. Adapte em segundos.
                </p>
              </>
            )}

            {scoreState === "has-cv" ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                  <div>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 500,
                        letterSpacing: -0.6,
                        color: "#0a0a0a",
                        lineHeight: 1,
                      }}
                    >
                      {jobsResult.total}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: "#8a8a85",
                        letterSpacing: 0.2,
                        marginTop: 5,
                      }}
                    >
                      vagas analisadas
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 500,
                        letterSpacing: -0.6,
                        color: "#1f7a34",
                        lineHeight: 1,
                      }}
                    >
                      {highCompatCount}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: "#8a8a85",
                        letterSpacing: 0.2,
                        marginTop: 5,
                      }}
                    >
                      altamente compatíveis
                    </div>
                  </div>
                </div>

                {user ? (
                  <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                    <Link
                      href="/vagas-salvas"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        height: 44,
                        boxSizing: "border-box",
                        background: "#fafaf6",
                        color: "#3a3a38",
                        border: "1px solid rgba(10,10,10,0.1)",
                        borderRadius: 10,
                        padding: "0 14px",
                        fontSize: 12.5,
                        fontWeight: 500,
                        textDecoration: "none",
                        fontFamily: GEIST,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <title>Vagas salvas</title>
                        <path
                          d="M6 3h12v18l-6-4-6 4V3z"
                          stroke="#3a3a38"
                          strokeWidth="1.7"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Ver Minhas Vagas
                    </Link>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        height: 44,
                        boxSizing: "border-box",
                        background: "#fafaf6",
                        border: "1px solid rgba(10,10,10,0.08)",
                        borderRadius: 10,
                        padding: "0 14px",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "rgba(34,163,72,0.14)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          aria-hidden
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <title>CV calibrado</title>
                          <path
                            d="M5 12l5 5L20 7"
                            stroke="#1f7a34"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 12,
                            fontWeight: 500,
                            color: "#0a0a0a",
                            maxWidth: 180,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {cvFileName ?? "CV enviado"}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#8a8a85" }}>
                          CV calibrado
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {scoreState !== "has-cv" && user ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Link
                  href="/vagas-salvas"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#fafaf6",
                    color: "#3a3a38",
                    border: "1px solid rgba(10,10,10,0.1)",
                    borderRadius: 99,
                    padding: "8px 14px",
                    fontSize: 12.5,
                    fontWeight: 500,
                    textDecoration: "none",
                    fontFamily: GEIST,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <title>Vagas salvas</title>
                    <path
                      d="M6 3h12v18l-6-4-6 4V3z"
                      stroke="#3a3a38"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Ver Minhas Vagas
                </Link>
              </div>
            ) : null}
          </div>
        </header>

        <div style={{ marginBottom: 24 }}>
          <FiltersBar
            key={`${effectiveModalidade ?? ""}|${senioridade ?? ""}|${empresa ?? ""}|${publicada ?? ""}`}
            facets={facets}
            activeFilters={activeFilters}
          />
        </div>

        {scoreState === "anonymous" ? <AnonymousHeroCard /> : null}

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
                  ? "Seu CV está sendo processado. Assim que terminar, cada vaga abaixo ganha um score de oportunidade com seu perfil."
                  : "Envie seu CV e cada vaga abaixo ganha um score de oportunidade com seu perfil — sem precisar filtrar nada."}
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
            <Carousel
              title={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#2fa84c",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: -0.1,
                      color: "#0a0a0a",
                    }}
                  >
                    Alta oportunidade
                  </span>
                  <span style={{ fontSize: 12.5, color: "#8a8a85" }}>
                    {carouselJobs.length}{" "}
                    {carouselJobs.length === 1
                      ? "vaga acima de 70%"
                      : "vagas acima de 70%"}
                  </span>
                </div>
              }
            >
              {carouselJobs.map((job) => (
                <CarouselCard
                  key={job.id}
                  job={job}
                  adaptarHref={adaptarHref}
                />
              ))}
            </Carousel>
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

          {scoreState === "has-cv" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a
                href={buildExcludeAnalyzedToggleUrl()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 12px",
                  borderRadius: 99,
                  background: excludeAnalyzed ? "#0a0a0a" : "#fafaf6",
                  color: excludeAnalyzed ? "#fafaf6" : "#3a3a38",
                  border: `1px solid ${excludeAnalyzed ? "#0a0a0a" : "rgba(10,10,10,0.1)"}`,
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                  fontFamily: GEIST,
                  textDecoration: "none",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    border: `1.5px solid ${excludeAnalyzed ? "#fafaf6" : "rgba(10,10,10,0.25)"}`,
                    background: excludeAnalyzed ? "#fafaf6" : "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {excludeAnalyzed ? (
                    <svg
                      aria-hidden
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <title>Ativo</title>
                      <path
                        d="M5 12l5 5L20 7"
                        stroke="#0a0a0a"
                        strokeWidth="3.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                excluir vagas já analisadas
              </a>

              <details
                className="vagas-filter-dropdown"
                style={{ position: "relative" }}
              >
                <style>{`
                .vagas-filter-dropdown > summary::-webkit-details-marker { display: none; }
              `}</style>
                <summary
                  style={{
                    listStyle: "none",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "8px 12px",
                    borderRadius: 99,
                    background: "#fafaf6",
                    color: "#3a3a38",
                    border: "1px solid rgba(10,10,10,0.1)",
                    fontSize: 12.5,
                    whiteSpace: "nowrap",
                    fontFamily: GEIST,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9.5,
                      letterSpacing: 0.4,
                      color: "#8a8a85",
                    }}
                  >
                    ordenar por
                  </span>
                  <span style={{ fontWeight: 500 }}>{SORT_LABELS[sort]}</span>
                  <svg
                    aria-hidden
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <title>Abrir</title>
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    background: "#fff",
                    border: "1px solid rgba(10,10,10,0.1)",
                    borderRadius: 10,
                    padding: 6,
                    zIndex: 20,
                    minWidth: 240,
                    boxShadow: "0 8px 28px rgba(0,0,0,0.1)",
                  }}
                >
                  {SORT_VALUES.map((value) => (
                    <a
                      key={value}
                      href={buildSortUrl(value)}
                      style={{
                        display: "block",
                        padding: "7px 10px",
                        borderRadius: 7,
                        fontSize: 13,
                        color: sort === value ? "#0a0a0a" : "#3a3a38",
                        fontWeight: sort === value ? 600 : 400,
                        textDecoration: "none",
                        background:
                          sort === value
                            ? "rgba(10,10,10,0.05)"
                            : "transparent",
                      }}
                    >
                      {SORT_LABELS[value]}
                    </a>
                  ))}
                </div>
              </details>
            </div>
          ) : null}
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
                isLoggedIn={!!user}
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
