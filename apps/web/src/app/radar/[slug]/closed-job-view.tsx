import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CompanyLogo } from "@/app/radar/company-logo";
import { RADAR_AREA_LABELS } from "@/app/radar/radar-ui";
import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
import type { AppSessionUser } from "@/lib/app-session";
import { toCompanySlug } from "@/lib/company-slug";
import { cleanJobTitleForDisplay } from "@/lib/job-seo";
import type { ClosedPublicJob, PublicJob } from "@/lib/public-jobs-api";
import { jobCompanyDisplayName } from "@/lib/radar-landings";
import { getAbsoluteUrl } from "@/lib/site";
import {
  formatEmploymentType,
  SENIORITY_LABELS,
  SimCard,
  splitHtmlSections,
  splitJobTitleForDisplay,
  WORK_MODEL_LABELS,
} from "./job-detail";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF =
  "var(--font-instrument-serif), 'Instrument Serif', Georgia, serif";

// Vaga encerrada não é conteúdo indexável (o Google já é avisado da remoção
// na inativação) e não leva JobPosting JSON-LD, mas os links dela continuam
// valendo pro crawler seguir. Canonical e og:url na própria URL: herdar os
// do layout apontava pra home, sinal contraditório com o noindex.
export function buildClosedJobMetadata(job: ClosedPublicJob): Metadata {
  const cargo = cleanJobTitleForDisplay(job.title);
  const empresa = jobCompanyDisplayName(job);
  const title = `Vaga encerrada: ${cargo} na ${empresa} | EarlyCV`;
  const description = `A vaga de ${cargo} na ${empresa} foi encerrada. Veja outras vagas abertas no EarlyCV.`;
  const url = getAbsoluteUrl(`/radar/${job.slug}`);
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: { type: "article", url, title, description },
    twitter: { title, description },
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function Chip({
  children,
  mono = false,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      style={{
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.1)",
        borderRadius: 8,
        padding: "7px 12px",
        fontSize: 12,
        color: mono ? "#8a8a85" : "#4a4a45",
        fontFamily: mono ? MONO : undefined,
      }}
    >
      {children}
    </span>
  );
}

// Página da vaga que saiu do radar (fechada na fonte ou retirada). Mesmo
// conteúdo do detalhe da vaga ativa — cabeçalho, descrição e detalhes —
// com o aviso de vaga encerrada no topo e NENHUM CTA: sem análise, adaptação,
// salvar, link de origem/candidatura nem Alerta. Existe pra que links antigos
// (candidaturas, vagas salvas, Alerta, e-mails) continuem mostrando a vaga.
export function ClosedJobView({
  job,
  similarJobs,
  user,
}: {
  job: ClosedPublicJob;
  similarJobs: PublicJob[];
  user: AppSessionUser | null;
}) {
  const sections = splitHtmlSections(job.descriptionHtml);
  const displayTitle = cleanJobTitleForDisplay(job.title);
  const titleParts = splitJobTitleForDisplay(displayTitle);
  const workModelLabel = job.workModel
    ? (WORK_MODEL_LABELS[job.workModel] ?? job.workModel)
    : null;
  const seniorityLabel = job.seniorityLevel
    ? (SENIORITY_LABELS[job.seniorityLevel.toLowerCase()] ?? job.seniorityLevel)
    : null;

  const navLinks: Array<{ href: string; label: string }> = [
    { href: "/radar", label: "Ver vagas abertas" },
    {
      href: `/radar/empresa/${toCompanySlug(job.company)}`,
      label: `Vagas abertas na ${jobCompanyDisplayName(job)}`,
    },
  ];
  if (job.dominantArea) {
    navLinks.push({
      href: `/radar/area/${job.dominantArea.toLowerCase()}`,
      label: `Vagas de ${RADAR_AREA_LABELS[job.dominantArea] ?? job.dominantArea}`,
    });
  }

  if (user) {
    navLinks.push({ href: "/candidaturas", label: "Minhas candidaturas" });
  }

  const details = [
    { label: "Empresa", value: jobCompanyDisplayName(job) },
    job.location ? { label: "Localização", value: job.location } : null,
    workModelLabel ? { label: "Modelo", value: workModelLabel } : null,
    job.employmentType
      ? { label: "Contrato", value: formatEmploymentType(job.employmentType) }
      : null,
    { label: "Situação", value: "Encerrada" },
  ].filter((item): item is { label: string; value: string } => item !== null);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 80% 50% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        fontFamily: GEIST,
        color: "#0a0a0a",
      }}
    >
      <PublicNavBar
        hideHowItWorksLink
        hideJobsLink
        fixed
        userName={user?.name}
        userRole={user?.internalRole}
        guestCtaLabel="Criar conta grátis →"
        guestCtaHref="/entrar?tab=cadastrar&ctx=radar"
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "108px clamp(16px,4vw,48px) 80px",
        }}
      >
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
            minWidth: 0,
          }}
        >
          <Link
            href="/radar"
            style={{ color: "#5a5a55", textDecoration: "none", flexShrink: 0 }}
          >
            Vagas
          </Link>
          <span style={{ color: "#c8c6bf", flexShrink: 0 }}>›</span>
          <span
            style={{
              color: "#0a0a0a",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {displayTitle}
          </span>
        </nav>

        {/* Aviso de vaga encerrada — primeira coisa da página, no padrão
            escuro dos blocos de destaque do radar (RadarGuestAnalysisBand) */}
        <section
          role="status"
          style={{
            background: "#0a0a0a",
            borderRadius: 22,
            padding: "clamp(24px,4vw,34px) clamp(20px,4vw,40px)",
            marginBottom: 32,
            color: "#fafaf6",
            boxShadow: "0 24px 60px -24px rgba(0,0,0,0.35)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.4,
              color: "#c6ff3a",
              background: "rgba(198,255,58,0.10)",
              border: "1px solid rgba(198,255,58,0.30)",
              borderRadius: 999,
              padding: "6px 12px",
              marginBottom: 16,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#c6ff3a",
                boxShadow: "0 0 10px 2px rgba(198,255,58,0.6)",
              }}
            />
            VAGA ENCERRADA
          </span>
          <h2
            style={{
              margin: "0 0 12px",
              fontWeight: 700,
              fontSize: "clamp(22px,3vw,30px)",
              lineHeight: 1.15,
              letterSpacing: -0.8,
            }}
          >
            Esta vaga{" "}
            <em style={{ fontFamily: SERIF, fontWeight: 400 }}>
              não está mais disponível.
            </em>
          </h2>
          <p
            style={{
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "#c8c6bf",
              margin: "0 0 18px",
              maxWidth: 720,
            }}
          >
            Ela saiu da página de carreiras da {jobCompanyDisplayName(job)}: o
            processo foi encerrado ou a vaga foi retirada pela empresa. Vista
            pela última vez em {formatDate(job.lastSeenAt)}. O conteúdo abaixo
            fica disponível só para consulta.
            {user
              ? " Se você tinha uma candidatura para ela, nada foi apagado — tudo continua em Candidaturas."
              : null}
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 20px",
              fontFamily: MONO,
              fontSize: 11.5,
            }}
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  color: "#fafaf6",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textDecorationColor: "rgba(250,250,246,0.3)",
                }}
              >
                {link.label} →
              </Link>
            ))}
          </div>
        </section>

        {/* Cabeçalho da vaga — mesmo do detalhe ativo, em tom apagado */}
        <header style={{ marginBottom: 32 }}>
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
                {jobCompanyDisplayName(job)}
              </div>
              {job.location ? (
                <div style={{ fontSize: 12, color: "#6a6560" }}>
                  {job.location}
                </div>
              ) : null}
            </div>
          </div>

          <h1
            style={{
              fontSize: "clamp(1.75rem,4vw,2.75rem)",
              fontWeight: 500,
              letterSpacing: -1.6,
              lineHeight: 1.05,
              marginBottom: 20,
              color: "#5a5a55",
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
                  }}
                >
                  {titleParts.emphasis}.
                </em>
              </>
            ) : (
              titleParts.lead
            )}
          </h1>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {workModelLabel ? <Chip>{workModelLabel}</Chip> : null}
            {seniorityLabel ? <Chip>{seniorityLabel}</Chip> : null}
            {job.employmentType ? (
              <Chip>{formatEmploymentType(job.employmentType)}</Chip>
            ) : null}
            {job.publishedAtSource ? (
              <Chip>Publicada {formatDate(job.publishedAtSource)}</Chip>
            ) : null}
            <Chip mono>encerrada · vista em {formatDate(job.lastSeenAt)}</Chip>
          </div>
        </header>

        <div
          className="closed-job-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 28,
            alignItems: "start",
          }}
        >
          <style>{`
            @media (max-width: 900px) {
              .closed-job-grid { grid-template-columns: 1fr !important; }
            }
            .job-prose ul, .job-prose ol { padding-left: 20px; margin: 10px 0; }
            .job-prose li { margin-bottom: 4px; }
            .job-prose p { margin: 0 0 12px; }
            .job-prose strong { font-weight: 600; }
            .job-prose { overflow-x: auto; overflow-wrap: anywhere; }
            .job-prose table { width: 100% !important; max-width: 100%; table-layout: auto; border-collapse: collapse; }
            .job-prose col { width: auto !important; }
            .job-prose td, .job-prose th { width: auto !important; max-width: 100%; word-break: break-word; }
            .job-prose img { max-width: 100%; height: auto; }
          `}</style>

          {/* Descrição original da vaga */}
          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 14,
              padding: "clamp(20px,4vw,30px)",
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
                  }}
                >
                  {section.title}
                </h2>
                <div
                  className="job-prose"
                  style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitizado em splitHtmlSections
                  dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
                />
              </div>
            ))}
          </div>

          {/* Detalhes — sem o link da fonte (não há mais onde se candidatar) */}
          <aside
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
              {details.map((item, idx) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "8px 0",
                    borderBottom:
                      idx < details.length - 1
                        ? "1px solid rgba(10,10,10,0.05)"
                        : "none",
                  }}
                >
                  <dt style={{ fontSize: 12, color: "#6a6560" }}>
                    {item.label}
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>

        {similarJobs.length > 0 ? (
          <div style={{ marginTop: 40 }}>
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
              VAGAS ABERTAS
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: -0.6,
                marginBottom: 16,
              }}
            >
              Outras vagas recentes
            </div>
            <style>{`
              .closed-job-similar-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
              @media (max-width: 900px) {
                .closed-job-similar-grid { grid-template-columns: 1fr; }
              }
            `}</style>
            <div className="closed-job-similar-grid">
              {similarJobs.map((similar) => (
                <SimCard key={similar.id} job={similar} showMatchLock={!user} />
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
    </main>
  );
}
