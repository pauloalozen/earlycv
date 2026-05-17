import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  getPublicJobBySlug,
  listPublicJobs,
  type PublicJob,
} from "@/lib/public-jobs-api";
import { getMyMasterResume } from "@/lib/resumes-api";
import { getAbsoluteUrl } from "@/lib/site";
import { JobScoreWidget, type ScoreState } from "../job-score-widget";

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

const COMPANY_COLORS = [
  "#3a7ff6",
  "#a855f7",
  "#06b6d4",
  "#f97316",
  "#22c55e",
  "#ec4899",
  "#eab308",
];

function getCompanyColor(name: string): string {
  return COMPANY_COLORS[name.charCodeAt(0) % COMPANY_COLORS.length];
}

type JobPageProps = {
  params: Promise<{ slug: string }>;
};

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

  const title = `${job.title} na ${job.company} | EarlyCV`;
  const description = `${job.title} na ${job.company} em ${job.location}. ${job.description.slice(0, 120)}`;
  const url = getAbsoluteUrl(`/vagas/${job.slug}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title, description },
    twitter: { title, description },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

function SimCard({ job }: { job: PublicJob }) {
  return (
    <Link
      href={`/vagas/${job.slug}`}
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
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            background: getCompanyColor(job.company),
            color: "#fafaf6",
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {job.company.charAt(0).toUpperCase()}
        </div>
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
    </Link>
  );
}

export default async function JobPage({ params }: JobPageProps) {
  const { slug } = await params;

  const [job, user] = await Promise.all([
    loadJob(slug),
    getCurrentAppUserFromCookies().catch(() => null),
  ]);

  if (!job) notFound();

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
  const adaptarJobHref = `${adaptarHref}${adaptarHref.includes("?") ? `&jobId=${job.id}` : `?jobId=${job.id}`}`;

  const sections = splitHtmlSections(job.descriptionHtml);

  const isEarly =
    !!job.publishedAtSource &&
    new Date(job.firstSeenAt).getTime() <
      new Date(job.publishedAtSource).getTime() + 6 * 3_600_000;

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

  const jobJsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.publishedAtSource ?? job.firstSeenAt,
    employmentType: job.employmentType ?? undefined,
    hiringOrganization: { "@type": "Organization", name: job.company },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressCountry: job.country ?? "BR",
        addressLocality: job.location,
      },
    },
    applicantLocationRequirements: { "@type": "Country", name: "Brasil" },
    directApply: true,
    url: getAbsoluteUrl(`/vagas/${job.slug}`),
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
            href="/vagas"
            style={{ color: "#5a5a55", textDecoration: "none" }}
          >
            Vagas
          </Link>
          <span style={{ color: "#c8c6bf" }}>›</span>
          <span style={{ color: "#0a0a0a" }}>{job.title}</span>
        </nav>

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
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: getCompanyColor(job.company),
                color: "#fafaf6",
                fontFamily: MONO,
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {job.company.charAt(0).toUpperCase()}
            </div>
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
            {job.title.includes("—") ? (
              <>
                {job.title.slice(0, job.title.indexOf("—") + 1)}
                <br />
                <em
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 400,
                    fontStyle: "italic",
                    color: "#3a3a38",
                  }}
                >
                  {job.title.slice(job.title.indexOf("—") + 1).trim()}.
                </em>
              </>
            ) : (
              job.title
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
                  background: "rgba(198,255,58,0.22)",
                  color: "#405410",
                  fontFamily: MONO,
                  fontSize: 10.5,
                  padding: "4px 9px",
                  borderRadius: 5,
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
                {job.employmentType}
              </span>
            ) : null}
            {isEarly ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
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
                <svg width="9" height="9" viewBox="0 0 24 24" fill="#405410">
                  <title>Early</title>
                  <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
                </svg>
                vaga nova — chegou ao EarlyCV antes do LinkedIn
              </span>
            ) : null}
          </div>

          {/* Meta cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
              maxWidth: 720,
            }}
          >
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
          </div>

          {/* Sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Compat widget (black card) */}
            <JobScoreWidget scoreState={scoreState} />

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
              <a
                href={adaptarJobHref}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  borderRadius: 9,
                  padding: "12px",
                  fontSize: 13.5,
                  fontWeight: 500,
                  textDecoration: "none",
                  fontFamily: GEIST,
                  marginBottom: 8,
                  boxSizing: "border-box",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#c6ff3a">
                  <title>Adaptar</title>
                  <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
                </svg>
                Adaptar CV para esta vaga
              </a>
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
              <button
                type="button"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  background: "transparent",
                  color: "#6a6560",
                  border: "none",
                  padding: "8px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: GEIST,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <title>Salvar</title>
                  <path
                    d="M6 3h12v18l-6-4-6 4V3z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
                salvar para depois
              </button>
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
                      ? { label: "Contrato", value: job.employmentType }
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
                href="/vagas"
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              {similarJobs.map((j) => (
                <SimCard key={j.id} job={j} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <PublicFooter />
    </main>
  );
}
