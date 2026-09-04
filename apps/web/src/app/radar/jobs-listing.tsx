import Link from "next/link";
import type { ReactNode } from "react";
import type { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  getPublicJobFacets,
  listPublicJobs,
  type PublicJob,
} from "@/lib/public-jobs-api";
import { getMyRadarProfile } from "@/lib/radar-api";
import { getMyMasterResume } from "@/lib/resumes-api";
import { getAbsoluteUrl } from "@/lib/site";
import { AnalyzeCardBtn } from "./analyze-card-btn";
import { Carousel } from "./carousel";
import { CompanyLogo } from "./company-logo";
import { type ActiveFilters, FiltersBar } from "./filters-bar";
import { JobCard } from "./job-card";
import { RadarOpportunityLink } from "./radar-opportunity-link";
import {
  AdaptBtn,
  BREAKDOWN_MAX,
  MiniBar,
  OpportunityBadge,
  OpportunityRing,
  RADAR_AREA_LABELS,
  RADAR_SENIORITY_LABELS,
  ScorePill,
  SkillChip,
} from "./radar-ui";
import { TurnstileAnalyzeProvider } from "./turnstile-analyze-context";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF =
  "var(--font-instrument-serif), 'Instrument Serif', Georgia, serif";

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

export type RadarSearchParams = {
  q?: string;
  area?: string;
  modalidade?: string;
  senioridade?: string;
  empresa?: string;
  estado?: string;
  cidade?: string;
  publicada?: string;
  minSkillsPct?: string;
  aderencia?: string;
  sort?: string;
  page?: string;
  excludeAnalyzed?: string;
};

export type RadarJobsListingProps = {
  // Base pra navegação (pagination/sort/toggle desta página e o basePath
  // repassado pra FiltersBar) — ex.: "/radar", "/radar/area/data_ai".
  basePath: string;
  user: Awaited<ReturnType<typeof getCurrentAppUserFromCookies>>;
  searchParams: RadarSearchParams;
  // Filtro fixo pela landing page (ex.: /radar/area/data_ai fixa area).
  // Sobrepõe qualquer valor vindo da URL pra essa dimensão, nunca aparece
  // como querystring redundante nos links de paginação/sort, e some do
  // controle correspondente na FiltersBar (nunca vira chip bloqueado nem
  // removível — o contexto é comunicado só pelo h1 da página).
  fixedFilters?: {
    area?: string;
    workModel?: string;
    seniority?: string;
    companyName?: string;
    // Sem controle correspondente na FiltersBar (não é um dos filtros que o
    // usuário edita hoje), então não precisa de tratamento de "hidden" nem
    // de round-trip pela URL — só entra direto na query.
    technology?: string;
  };
  // Quando presente, substitui o hero padrão (título "Vagas em tech..."/
  // calibração + stats do Radar) por um cabeçalho simples e estático —
  // usado pelas landing pages de SEO, que não devem replicar a
  // personalização do /radar "portal" principal.
  landingHeader?: {
    eyebrow: string;
    title: ReactNode;
    description?: ReactNode;
  };
};

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

// Dado ilustrativo fixo (não vem da API) — score total calculado a partir
// das 4 dimensões exibidas com os mesmos pesos de MatchingEngine
// (BREAKDOWN_MAX), pra bater com o breakdown mostrado logo abaixo. Language
// e workModel não aparecem no card (só cabem 4 dimensões no preview), então
// assumimos match total nelas.
const HERO_AREA_PCT = 100;
const HERO_SKILLS_PCT = 62;
const HERO_SENIORITY_PCT = 94;
const HERO_TECHNOLOGIES_PCT = 80;
const HERO_SCORE = Math.round(
  (BREAKDOWN_MAX.area * HERO_AREA_PCT +
    BREAKDOWN_MAX.skills * HERO_SKILLS_PCT +
    BREAKDOWN_MAX.seniority * HERO_SENIORITY_PCT +
    BREAKDOWN_MAX.technologies * HERO_TECHNOLOGIES_PCT +
    BREAKDOWN_MAX.language * 100 +
    BREAKDOWN_MAX.workModel * 100) /
    100,
);

// Card esquerdo do hero de 2 colunas (anônimo/no-cv) — só título, descrição
// e CTA mudam entre as duas variantes; moldura e ícone (raio) são
// idênticos, por isso ficaram num componente à parte em vez de duplicados.
const HERO_BENEFIT_BULLETS = [
  "Vagas antes de todo mundo",
  "Score de aderência automático",
  "Adapte seu CV em segundos",
];

function HeroBenefitRow({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "rgba(198,255,58,0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 6L9 17l-5-5"
            stroke="#405410"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span style={{ fontSize: 13, color: "#3a3a36" }}>{label}</span>
    </div>
  );
}

function HeroCtaCard({
  eyebrow,
  title,
  description,
  href,
  buttonLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  buttonLabel: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 14,
        padding: "24px 26px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <p
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 0.4,
          color: "#8a8a85",
          margin: "0 0 14px",
        }}
      >
        {eyebrow}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(198,255,58,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <title>{title}</title>
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="#405410" />
          </svg>
        </div>
        <div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#0a0a0a",
              margin: "0 0 3px",
              lineHeight: 1.25,
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontSize: 13,
              color: "#5a5a55",
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            {description}
          </p>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "14px 0",
          margin: "2px 0 16px",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
        }}
      >
        {HERO_BENEFIT_BULLETS.map((label) => (
          <HeroBenefitRow key={label} label={label} />
        ))}
      </div>
      <a
        href={href}
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
          marginTop: "auto",
          alignSelf: "center",
        }}
      >
        {buttonLabel} →
      </a>
    </div>
  );
}

// Card direito do hero de 2 colunas — preview ilustrativo (dado fixo, não
// vem da API) de como fica a vaga depois que a pessoa tem CV master
// calibrado. Idêntico nas variantes anônima e "no-cv" (a única diferença
// entre elas é o CTA à esquerda, ver HeroCtaCard).
function HeroPreviewCard() {
  return (
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
              <rect
                x="16"
                y="0"
                width="12"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
              <rect
                x="0"
                y="11.2"
                width="16"
                height="6.5"
                rx="2"
                fill="#c6ff3a"
              />
              <rect
                x="20"
                y="11.2"
                width="18"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect
                x="0"
                y="22.4"
                width="7"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect
                x="11"
                y="22.4"
                width="16"
                height="6.5"
                rx="2"
                fill="#c6ff3a"
              />
              <rect
                x="30"
                y="22.4"
                width="8"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect
                x="0"
                y="33.5"
                width="22"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
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
            <p style={{ fontSize: 12, color: "#8a8a85", margin: 0 }}>earlyCV</p>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <OpportunityRing score={HERO_SCORE} size={52} />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 0.4,
                color: "#8a8a85",
              }}
            >
              OPORTUNIDADE
            </span>
          </div>
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
          <MiniBar label="Área" value={HERO_AREA_PCT} compact />
          <MiniBar label="Skills" value={HERO_SKILLS_PCT} compact />
          <MiniBar label="Senioridade" value={HERO_SENIORITY_PCT} compact />
          <MiniBar label="Tecnologias" value={HERO_TECHNOLOGIES_PCT} compact />
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
        Score, skills e breakdown completo — calculados assim que você cria sua
        conta e envia o CV.
      </p>
    </div>
  );
}

function HeroTwoColumnGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="anon-hero-grid" style={{ marginBottom: 24 }}>
      <style>{`
        .anon-hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 760px) {
          .anon-hero-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      {children}
    </div>
  );
}

function AnonymousHeroCard() {
  return (
    <HeroTwoColumnGrid>
      <HeroCtaCard
        buttonLabel="Criar conta grátis"
        description="Crie sua conta e envie o CV pra ver as melhores oportunidades com score calculado pra você."
        eyebrow="SEM CONTA AINDA"
        href="/entrar?tab=cadastrar&ctx=radar"
        title="Vagas feitas pro seu perfil"
      />
      <HeroPreviewCard />
    </HeroTwoColumnGrid>
  );
}

// Mesmo card de preview do anônimo — a pessoa já tem conta, só falta
// cadastrar o CV master, então o CTA muda de "criar conta" pra "cadastrar
// CV master" (ver pedido do Paulo: layout idêntico ao anônimo, só o texto
// do card da esquerda muda).
function NoCvHeroCard({ cvFileName }: { cvFileName: string | null }) {
  return (
    <HeroTwoColumnGrid>
      <HeroCtaCard
        buttonLabel={cvFileName ? "Ver status" : "Enviar CV"}
        description={
          cvFileName
            ? "seu CV está sendo processado — assim que terminar, cada vaga ganha uma classificação de oportunidade com seu perfil"
            : "para ver as melhores oportunidades pro seu perfil"
        }
        eyebrow="FALTA UM PASSO"
        href="/meu-cv-master"
        title="cadastrar CV master"
      />
      <HeroPreviewCard />
    </HeroTwoColumnGrid>
  );
}

function CarouselCard({
  job,
  adaptarHref,
  masterResumeId,
}: {
  job: PublicJob;
  adaptarHref: string;
  masterResumeId: string | null;
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
          logoUrl={job.companyLogoUrl}
          websiteUrl={job.companyWebsiteUrl}
          size={32}
          borderRadius={8}
          fontSize={11}
        />
        {hasAnalysis ? (
          <ScorePill value={displayScore} format="label-first" />
        ) : (
          <OpportunityBadge score={displayScore} />
        )}
      </div>
      <div>
        <RadarOpportunityLink
          href={`/radar/${job.slug}`}
          jobId={job.id}
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
        </RadarOpportunityLink>
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
          <AnalyzeCardBtn
            masterResumeId={masterResumeId}
            radarJobId={job.id}
            jobDescriptionText={job.description}
            adaptarUrl={adaptarUrl}
            score={job.score}
            fullWidth
          />
        )}
      </div>
    </div>
  );
}

export async function RadarJobsListing({
  basePath,
  user,
  searchParams: params,
  fixedFilters,
  landingHeader,
}: RadarJobsListingProps) {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  // Resolvido cedo (antes do default de sort) porque o default depende
  // disso: sem CV master pra calcular oportunidade, ordenar por "oportunidade"
  // por padrão não faz sentido (não há score pra rankear) — só data recente.
  let radarProfile: Awaited<ReturnType<typeof getMyRadarProfile>> = null;
  let cvFileName: string | null = null;
  let masterResumeId: string | null = null;
  if (user) {
    const [master, radar] = await Promise.all([
      getMyMasterResume().catch(() => null),
      getMyRadarProfile(),
    ]);
    cvFileName = master?.sourceFileName ?? null;
    masterResumeId = master?.id ?? null;
    radarProfile = radar;
  }

  const hasRadar = !!radarProfile && radarProfile.areas.length > 0;
  // hasRadar por si só não prova que o usuário tem CV master — o perfil de
  // radar (área/senioridade) pode ter sido configurado manualmente e
  // sobrevive à exclusão do CV master (não é limpo junto). Sem
  // masterResumeId aqui, score/badges de compatibilidade ficariam calculados
  // "no ar", sugerindo um CV que não existe mais.
  const scoreState: "anonymous" | "has-cv" | "no-cv" = !user
    ? "anonymous"
    : hasRadar && masterResumeId
      ? "has-cv"
      : "no-cv";

  // fixedFilters sempre vence o que vier na URL — landing pages (ex.:
  // /radar/area/data_ai) não podem ser "escapadas" trocando a querystring
  // na mão.
  const isAreaFixed = !!fixedFilters?.area;
  const isModalidadeFixed = !!fixedFilters?.workModel;
  const isSeniorityFixed = !!fixedFilters?.seniority;
  const isEmpresaFixed = !!fixedFilters?.companyName;

  const area = fixedFilters?.area ?? params.area;
  const q = params.q;
  const modalidade = fixedFilters?.workModel ?? params.modalidade;
  const senioridade = fixedFilters?.seniority ?? params.senioridade;
  const empresa = fixedFilters?.companyName ?? params.empresa;
  const estado = params.estado;
  const cidade = params.cidade;
  const publicada = params.publicada;
  const minSkillsPct = params.minSkillsPct;
  const aderencia = params.aderencia;
  // Sem CV master calculando oportunidade, ordenar por "oportunidade" por
  // padrão não faz sentido (não há score pra rankear) — cai pra data recente.
  const defaultSort: SortValue =
    scoreState === "has-cv" ? "score_desc" : "date_desc";
  const sort: SortValue = SORT_VALUES.includes(params.sort as SortValue)
    ? (params.sort as SortValue)
    : defaultSort;
  // Checkbox vem marcado por padrão — só grava na URL quando desmarcado
  // (excludeAnalyzed=false), então ausência do param == filtro ativo.
  const excludeAnalyzed = params.excludeAnalyzed !== "false";

  // area/senioridade/estado/cidade são filtros estruturais de verdade (via
  // WHERE no banco, ver buildPublicJobsWhere em jobs.service.ts) — não viram
  // mais busca textual solta nem se confundem com modalidade/q.
  const effectiveQ = q;
  const effectiveModalidade = modalidade;

  const publishedWithin =
    publicada && publicada in PUBLISHED_WITHIN_MAP
      ? PUBLISHED_WITHIN_MAP[publicada as keyof typeof PUBLISHED_WITHIN_MAP]
      : undefined;

  const [jobsResult, facets] = await Promise.all([
    listPublicJobs({
      q: effectiveQ,
      workModel: effectiveModalidade,
      seniority: senioridade,
      companyName: empresa,
      area,
      state: estado,
      city: cidade,
      technology: fixedFilters?.technology,
      publishedWithin,
      page,
      limit: 20,
      minSkillsPct: minSkillsPct
        ? Number.parseInt(minSkillsPct, 10)
        : undefined,
      aderencia,
      sort,
      excludeAnalyzed,
    }),
    getPublicJobFacets({ state: estado }).catch(() => null),
  ]);

  const adaptarHref = user ? "/adaptar" : "/entrar?tab=cadastrar&ctx=radar";
  const totalPages = Math.ceil(jobsResult.total / jobsResult.limit);

  // Dimensões fixas pela landing page nunca entram no ActiveFilters da
  // FiltersBar — ela não tem controle pra elas (hiddenFilters, abaixo), e um
  // valor "aplicado" sem controle pra editar/remover viraria um chip
  // travado, o que a decisão de UX pra essas páginas rejeitou de propósito.
  const activeFilters: ActiveFilters = {
    q: effectiveQ,
    modalidade: isModalidadeFixed ? undefined : effectiveModalidade,
    senioridade: isSeniorityFixed ? undefined : senioridade,
    empresa: isEmpresaFixed ? undefined : empresa,
    publicada,
    area: isAreaFixed ? undefined : area,
    estado,
    cidade,
    minSkillsPct,
    aderencia,
    sort,
    excludeAnalyzed: excludeAnalyzed ? undefined : "false",
  };
  const hiddenFilters = [
    isAreaFixed ? ("area" as const) : null,
    isModalidadeFixed ? ("modalidade" as const) : null,
    isSeniorityFixed ? ("senioridade" as const) : null,
    isEmpresaFixed ? ("empresa" as const) : null,
    // Sem UserRadarProfile não existe score calculável — filtrar por
    // categoria de aderência não faz sentido nesse estado (mesmo motivo do
    // backend rejeitar minScore/minSkillsPct sem score, ver
    // public-jobs.controller.ts).
    scoreState !== "has-cv" ? ("aderencia" as const) : null,
  ].filter(
    (v): v is "area" | "modalidade" | "senioridade" | "empresa" | "aderencia" =>
      v !== null,
  );

  function buildPageUrl(targetPage: number) {
    const p = new URLSearchParams();
    if (effectiveQ) p.set("q", effectiveQ);
    if (!isModalidadeFixed && effectiveModalidade)
      p.set("modalidade", effectiveModalidade);
    if (!isSeniorityFixed && senioridade) p.set("senioridade", senioridade);
    if (!isEmpresaFixed && empresa) p.set("empresa", empresa);
    if (publicada) p.set("publicada", publicada);
    if (!isAreaFixed && area) p.set("area", area);
    if (estado) p.set("estado", estado);
    if (cidade) p.set("cidade", cidade);
    if (minSkillsPct) p.set("minSkillsPct", minSkillsPct);
    if (aderencia) p.set("aderencia", aderencia);
    if (sort) p.set("sort", sort);
    if (!excludeAnalyzed) p.set("excludeAnalyzed", "false");
    p.set("page", String(targetPage));
    return `?${p.toString()}`;
  }

  function buildSortUrl(sortValue: SortValue) {
    const p = new URLSearchParams();
    if (effectiveQ) p.set("q", effectiveQ);
    if (!isModalidadeFixed && effectiveModalidade)
      p.set("modalidade", effectiveModalidade);
    if (!isSeniorityFixed && senioridade) p.set("senioridade", senioridade);
    if (!isEmpresaFixed && empresa) p.set("empresa", empresa);
    if (publicada) p.set("publicada", publicada);
    if (!isAreaFixed && area) p.set("area", area);
    if (estado) p.set("estado", estado);
    if (cidade) p.set("cidade", cidade);
    if (minSkillsPct) p.set("minSkillsPct", minSkillsPct);
    if (aderencia) p.set("aderencia", aderencia);
    if (sortValue !== defaultSort) p.set("sort", sortValue);
    if (!excludeAnalyzed) p.set("excludeAnalyzed", "false");
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  function buildExcludeAnalyzedToggleUrl() {
    const p = new URLSearchParams();
    if (effectiveQ) p.set("q", effectiveQ);
    if (!isModalidadeFixed && effectiveModalidade)
      p.set("modalidade", effectiveModalidade);
    if (!isSeniorityFixed && senioridade) p.set("senioridade", senioridade);
    if (!isEmpresaFixed && empresa) p.set("empresa", empresa);
    if (publicada) p.set("publicada", publicada);
    if (!isAreaFixed && area) p.set("area", area);
    if (estado) p.set("estado", estado);
    if (cidade) p.set("cidade", cidade);
    if (minSkillsPct) p.set("minSkillsPct", minSkillsPct);
    if (aderencia) p.set("aderencia", aderencia);
    if (sort) p.set("sort", sort);
    if (excludeAnalyzed) p.set("excludeAnalyzed", "false");
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
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
      url: getAbsoluteUrl(`/radar/${job.slug}`),
    })),
  };

  return (
    <TurnstileAnalyzeProvider>
      <script type="application/ld+json">
        {JSON.stringify(itemListJsonLd)}
      </script>

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
            {landingHeader
              ? landingHeader.eyebrow
              : scoreState === "has-cv"
                ? "RADAR DE OPORTUNIDADES"
                : "PORTAL DE VAGAS"}
          </div>

          {landingHeader ? (
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
                {landingHeader.title}
              </h1>
              {landingHeader.description ? (
                <p
                  style={{
                    fontSize: 15.5,
                    color: "#5a5a55",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {landingHeader.description}
                </p>
              ) : null}
            </>
          ) : scoreState === "has-cv" && calibration ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
                marginBottom: 28,
              }}
            >
              <h1
                style={{
                  fontSize: "clamp(1.75rem,4.5vw,2.75rem)",
                  fontWeight: 500,
                  letterSpacing: -1.4,
                  lineHeight: 1.08,
                  margin: 0,
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
            </div>
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

          {!landingHeader && scoreState === "has-cv" ? (
            <style>{`
              .hero-cv-desktop { display: flex; }
              .hero-cv-mobile { display: none; }
              @media (max-width: 640px) {
                .hero-cv-desktop { display: none; }
                .hero-cv-mobile { display: flex; }
              }
            `}</style>
          ) : null}

          {!landingHeader && scoreState === "has-cv" ? (
            <div
              className="hero-cv-desktop"
              style={{
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 7 }}
                >
                  <b
                    style={{
                      fontSize: 19,
                      fontWeight: 600,
                      letterSpacing: -0.4,
                      color: "#0a0a0a",
                      lineHeight: 1,
                    }}
                  >
                    {jobsResult.total}
                  </b>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#8a8a85",
                    }}
                  >
                    vagas analisadas
                  </span>
                </div>
                <div
                  aria-hidden
                  style={{
                    width: 1,
                    height: 16,
                    background: "rgba(10,10,10,0.1)",
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 7 }}
                >
                  <b
                    style={{
                      fontSize: 19,
                      fontWeight: 600,
                      letterSpacing: -0.4,
                      color: "#1f7a34",
                      lineHeight: 1,
                    }}
                  >
                    {highCompatCount}
                  </b>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#8a8a85",
                    }}
                  >
                    altamente compatíveis
                  </span>
                </div>
              </div>

              {user ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link
                    href="/minhas-vagas"
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

          {!landingHeader && scoreState === "has-cv" ? (
            <div
              className="hero-cv-mobile"
              style={{ flexDirection: "column", gap: 10 }}
            >
              <div
                style={{
                  display: "flex",
                  background: "#fff",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 12,
                }}
              >
                <div style={{ flex: 1, padding: "12px 14px" }}>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 500,
                      letterSpacing: -0.5,
                      color: "#0a0a0a",
                      lineHeight: 1,
                    }}
                  >
                    {jobsResult.total}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#8a8a85",
                      letterSpacing: 0.2,
                      marginTop: 5,
                    }}
                  >
                    vagas analisadas
                  </div>
                </div>
                <div
                  aria-hidden
                  style={{
                    width: 1,
                    alignSelf: "stretch",
                    background: "rgba(10,10,10,0.08)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, padding: "12px 14px" }}>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 500,
                      letterSpacing: -0.5,
                      color: "#1f7a34",
                      lineHeight: 1,
                    }}
                  >
                    {highCompatCount}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
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
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "#fff",
                      border: "1px solid rgba(10,10,10,0.08)",
                      borderRadius: 12,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
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
                        width="12"
                        height="12"
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#0a0a0a",
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

                  <Link
                    href="/minhas-vagas"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#fff",
                      border: "1px solid rgba(10,10,10,0.08)",
                      borderRadius: 12,
                      padding: "12px 14px",
                      color: "#3a3a38",
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: GEIST,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
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
                </>
              ) : null}
            </div>
          ) : null}

          {scoreState !== "has-cv" && user ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Link
                href="/minhas-vagas"
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
          key={`${effectiveModalidade ?? ""}|${senioridade ?? ""}|${area ?? ""}|${empresa ?? ""}|${estado ?? ""}|${cidade ?? ""}|${publicada ?? ""}`}
          facets={facets}
          activeFilters={activeFilters}
          basePath={basePath}
          hiddenFilters={hiddenFilters}
        />
      </div>

      {scoreState === "anonymous" ? <AnonymousHeroCard /> : null}

      {scoreState === "no-cv" ? <NoCvHeroCard cvFileName={cvFileName} /> : null}

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
                    ? "vaga com alta oportunidade"
                    : "vagas com alta oportunidade"}
                </span>
              </div>
            }
          >
            {carouselJobs.map((job) => (
              <CarouselCard
                key={job.id}
                job={job}
                adaptarHref={adaptarHref}
                masterResumeId={masterResumeId}
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
          flexWrap: "wrap",
          gap: 10,
          paddingBottom: 14,
          marginBottom: 14,
        }}
      >
        <div className="results-count">
          <style>{`
            @media (max-width: 640px) {
              .results-count { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px; width: 100%; }
              .results-count > p { margin: 0; }
            }
          `}</style>
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
              {jobsResult.total === 1 ? "vaga encontrada" : "vagas encontradas"}
            </span>
          </div>
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
        </div>

        {scoreState === "has-cv" ? (
          <div
            className="results-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "nowrap",
              minWidth: 0,
            }}
          >
            <style>{`
              .results-actions > a, .results-actions summary { padding: 8px 12px; font-size: 12.5px; }
              @media (max-width: 400px) {
                .results-actions > a, .results-actions summary {
                  padding: 7px 9px;
                  font-size: 11.5px;
                }
              }
            `}</style>
            <a
              href={buildExcludeAnalyzedToggleUrl()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                flexShrink: 0,
                borderRadius: 99,
                background: excludeAnalyzed ? "#0a0a0a" : "#fafaf6",
                color: excludeAnalyzed ? "#fafaf6" : "#3a3a38",
                border: `1px solid ${excludeAnalyzed ? "#0a0a0a" : "rgba(10,10,10,0.1)"}`,
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
              excluir analisadas
            </a>

            <details
              className="vagas-filter-dropdown"
              style={{ position: "relative", minWidth: 0, flex: "1 1 auto" }}
            >
              <style>{`
              .vagas-filter-dropdown > summary::-webkit-details-marker { display: none; }
            `}</style>
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  borderRadius: 99,
                  background: "#fafaf6",
                  color: "#3a3a38",
                  border: "1px solid rgba(10,10,10,0.1)",
                  fontFamily: GEIST,
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: 0.4,
                    color: "#8a8a85",
                    flexShrink: 0,
                  }}
                >
                  ordenar
                </span>
                <span
                  style={{
                    fontWeight: 500,
                    flex: "1 1 auto",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {SORT_LABELS[sort]}
                </span>
                <svg
                  aria-hidden
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0 }}
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
                        sort === value ? "rgba(10,10,10,0.05)" : "transparent",
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
        {jobsResult.data.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            adaptarHref={adaptarHref}
            showScore={scoreState === "has-cv"}
            isLoggedIn={!!user}
            masterResumeId={masterResumeId}
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
    </TurnstileAnalyzeProvider>
  );
}
