import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyPlan } from "@/lib/plans-api";
import {
  cityLanding,
  companyCountDisplayName,
  companyLanding,
  formatCount,
  getRadarLandingIndex,
  getRadarLandingSummary,
  type LandingLinkGroup,
  landingFaq,
  landingIntro,
  landingRelatedLinks,
  landingSeoDescription,
  landingSeoTitle,
  listEligibleLandings,
  percent,
  type RadarLanding,
  type RadarLandingIndex,
  type RadarLandingSummary,
  SENIORITY_LABELS,
  technologyLabel,
  technologyLanding,
  WORK_MODEL_LABELS,
} from "@/lib/radar-landings";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "../jobs-listing";
import { RadarPageShell } from "../page-shell";
import { RadarViewTracker } from "../radar-view-tracker";

const MONO = "var(--font-geist-mono), monospace";
const INK = "#0a0a0a";
const MUTED = "#5a5a55";
const FAINT = "#8a8a85";
const CARD = {
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 14,
  padding: "18px 20px",
} as const;

export function landingPageNumber(searchParams: RadarSearchParams): number {
  return Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
}

// Página 2+ tem canonical próprio (antes apontava para a página 1, o que
// escondia do Google tudo além das 20 primeiras vagas).
function canonicalPath(landing: RadarLanding, page: number): string {
  return page > 1 ? `${landing.path}?page=${page}` : landing.path;
}

const NOT_FOUND_METADATA: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: false },
};

export async function buildRadarLandingMetadata(
  landing: RadarLanding | null,
  searchParams: RadarSearchParams,
): Promise<Metadata> {
  if (!landing) return NOT_FOUND_METADATA;

  const page = landingPageNumber(searchParams);
  const summary = await getRadarLandingSummary(landing.filters);
  if (landing.notFoundWhenEmpty && summary && summary.total === 0) {
    return NOT_FOUND_METADATA;
  }

  const title = landingSeoTitle(landing, summary, page);
  const description = landingSeoDescription(landing, summary);
  const url = getAbsoluteUrl(canonicalPath(landing, page));
  // Sem panorama (API fora) a página segue indexável: um soluço da API não
  // pode tirar a landing do índice.
  const indexable = !summary || summary.total >= landing.minIndexable;

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: { type: "website", url, title, description },
    twitter: { title, description },
  };
}

export async function RadarLandingPage({
  landing,
  searchParams,
}: {
  landing: RadarLanding;
  searchParams: RadarSearchParams;
}) {
  const user = await getCurrentAppUserFromCookies().catch(() => null);
  const availableCredits = user
    ? toHeaderAvailableCredits(await getMyPlan().catch(() => null))
    : undefined;

  const [summary, index] = await Promise.all([
    getRadarLandingSummary(landing.filters),
    getRadarLandingIndex(),
  ]);
  if (landing.notFoundWhenEmpty && summary && summary.total === 0) notFound();

  const crumbs = [{ name: "Início", path: "/" }, ...landing.breadcrumbs];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: getAbsoluteUrl(crumb.path),
    })),
  };

  const hasJobs = !!summary && summary.total > 0;

  return (
    <RadarPageShell
      userName={user?.name}
      userRole={user?.internalRole}
      credits={availableCredits}
      extraHead={
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbJsonLd)}
        </script>
      }
    >
      <RadarViewTracker {...landing.tracker} />
      <LandingBreadcrumbs crumbs={crumbs} />
      <RadarJobsListing
        basePath={landing.path}
        user={user}
        searchParams={searchParams}
        fixedFilters={{
          area: landing.filters.area,
          workModel: landing.filters.workModel,
          seniority: landing.filters.seniority,
          companyName: landing.filters.companyName,
          technology: landing.filters.technology,
          city: landing.listingCity ?? landing.filters.city,
          state: landing.listingState ?? landing.filters.state,
        }}
        itemListName={landing.heading}
        landingHeader={{
          eyebrow: "PORTAL DE VAGAS",
          title: landing.heading,
          description: hasJobs
            ? landingIntro(landing, summary)
            : `Encontre ${landing.subject} e analise seu CV gratuitamente.`,
        }}
      />
      {hasJobs && index ? (
        <LandingInsights landing={landing} summary={summary} index={index} />
      ) : null}
      {index ? (
        <RadarExploreLinks
          groups={landingRelatedLinks(landing, summary, index)}
        />
      ) : null}
    </RadarPageShell>
  );
}

function LandingBreadcrumbs({
  crumbs,
}: {
  crumbs: Array<{ name: string; path: string }>;
}) {
  return (
    <nav
      aria-label="Navegação"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        fontFamily: MONO,
        fontSize: 11,
        color: FAINT,
        marginBottom: 14,
      }}
    >
      {crumbs.map((crumb, i) => (
        <Fragment key={crumb.path}>
          {i > 0 ? <span aria-hidden>/</span> : null}
          {i === crumbs.length - 1 ? (
            <span style={{ color: MUTED }} aria-current="page">
              {crumb.name}
            </span>
          ) : (
            <Link
              href={crumb.path}
              style={{ color: FAINT, textDecoration: "none" }}
            >
              {crumb.name}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "clamp(1.25rem,3vw,1.6rem)",
        fontWeight: 500,
        letterSpacing: -0.6,
        lineHeight: 1.15,
        margin: "0 0 16px",
        color: INK,
      }}
    >
      {children}
    </h2>
  );
}

function ListTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: MONO,
        fontSize: 10.5,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: FAINT,
        fontWeight: 500,
        margin: "0 0 10px",
      }}
    >
      {children}
    </h3>
  );
}

type RankedItem = { label: string; count: number; href?: string };

function RankedList({ items }: { items: RankedItem[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li
          key={item.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "5px 0",
            fontSize: 14,
            color: INK,
            borderBottom: "1px solid rgba(10,10,10,0.05)",
          }}
        >
          {item.href ? (
            <Link href={item.href} style={{ color: INK }}>
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
          <span style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>
            {formatCount(item.count)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ShareList({
  items,
  total,
}: {
  items: Array<{ label: string; count: number }>;
  total: number;
}) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => {
        const pct = percent(item.count, total);
        return (
          <li key={item.label} style={{ padding: "5px 0" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                color: INK,
                marginBottom: 4,
              }}
            >
              <span>{item.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>
                {pct}%
              </span>
            </div>
            <div
              aria-hidden
              style={{
                height: 4,
                borderRadius: 2,
                background: "rgba(10,10,10,0.06)",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: 4,
                  borderRadius: 2,
                  background: INK,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={CARD}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: FAINT,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: -1,
          color: INK,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

// Panorama do recorte: tudo vem das vagas abertas agora, então o texto de
// cada landing é próprio e muda com o mercado.
function LandingInsights({
  landing,
  summary,
  index,
}: {
  landing: RadarLanding;
  summary: RadarLandingSummary;
  index: RadarLandingIndex;
}) {
  const eligiblePaths = new Set(
    listEligibleLandings(index).map((item) => item.landing.path),
  );
  const linkIfEligible = (path: string) =>
    eligiblePaths.has(path) && path !== landing.path ? path : undefined;

  const remote = summary.workModels.find((item) => item.value === "remote");
  const companies: RankedItem[] =
    landing.kind === "company"
      ? []
      : summary.companies.slice(0, 8).map((company) => ({
          label: companyCountDisplayName(company),
          count: company.count,
          href: linkIfEligible(
            companyLanding(company.name, companyCountDisplayName(company)).path,
          ),
        }));
  const technologies: RankedItem[] = summary.technologies
    .filter((tech) => tech.value !== landing.filters.technology)
    .slice(0, 8)
    .map((tech) => ({
      label: technologyLabel(tech.value),
      count: tech.count,
      href: linkIfEligible(technologyLanding(tech.value).path),
    }));
  const cities: RankedItem[] = landing.filters.city
    ? []
    : summary.cities.slice(0, 6).map((city) => ({
        label: `${city.city} (${city.state})`,
        count: city.count,
        href: linkIfEligible(cityLanding(city).path),
      }));
  const workModels = landing.filters.workModel
    ? []
    : summary.workModels
        .filter((item) => WORK_MODEL_LABELS[item.value])
        .map((item) => ({
          label: WORK_MODEL_LABELS[item.value] as string,
          count: item.count,
        }));
  const seniorities = landing.filters.seniority
    ? []
    : summary.seniorities
        .filter((item) => SENIORITY_LABELS[item.value])
        .slice(0, 6)
        .map((item) => ({
          label: SENIORITY_LABELS[item.value] as string,
          count: item.count,
        }));

  const lists = [
    companies.length > 0 ? (
      <div key="companies" style={CARD}>
        <ListTitle>Empresas que mais contratam</ListTitle>
        <RankedList items={companies} />
      </div>
    ) : null,
    technologies.length > 0 ? (
      <div key="technologies" style={CARD}>
        <ListTitle>Tecnologias mais pedidas</ListTitle>
        <RankedList items={technologies} />
      </div>
    ) : null,
    workModels.length > 0 ? (
      <div key="workModels" style={CARD}>
        <ListTitle>Modalidade</ListTitle>
        <ShareList items={workModels} total={summary.total} />
      </div>
    ) : null,
    seniorities.length > 0 ? (
      <div key="seniorities" style={CARD}>
        <ListTitle>Nível</ListTitle>
        <ShareList items={seniorities} total={summary.total} />
      </div>
    ) : null,
    cities.length > 0 ? (
      <div key="cities" style={CARD}>
        <ListTitle>Cidades com mais vagas</ListTitle>
        <RankedList items={cities} />
      </div>
    ) : null,
  ].filter(Boolean);

  const faq = landingFaq(landing, summary);

  return (
    <section style={{ marginTop: 56 }} aria-labelledby="panorama-title">
      <h2
        id="panorama-title"
        style={{
          fontSize: "clamp(1.25rem,3vw,1.6rem)",
          fontWeight: 500,
          letterSpacing: -0.6,
          lineHeight: 1.15,
          margin: "0 0 6px",
          color: INK,
        }}
      >
        Panorama: {landing.subject}
      </h2>
      <p style={{ fontSize: 14, color: MUTED, margin: "0 0 18px" }}>
        Números das vagas abertas agora no EarlyCV
        {summary.latestAt
          ? ` · última vaga publicada em ${formatDate(summary.latestAt)}`
          : ""}
        .
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <StatTile label="Vagas abertas" value={formatCount(summary.total)} />
        <StatTile
          label="Novas em 7 dias"
          value={formatCount(summary.newLast7Days)}
        />
        {landing.filters.workModel ? null : (
          <StatTile
            label="Remotas"
            value={`${percent(remote?.count ?? 0, summary.total)}%`}
          />
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {lists}
      </div>

      <div style={{ marginTop: 48 }}>
        <SectionTitle>Perguntas frequentes</SectionTitle>
        <div style={{ display: "grid", gap: 10 }}>
          {faq.map((item) => (
            <div key={item.question} style={CARD}>
              <h3
                style={{
                  fontSize: 15.5,
                  fontWeight: 600,
                  margin: "0 0 6px",
                  color: INK,
                }}
              >
                {item.question}
              </h3>
              <p
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: MUTED,
                  margin: 0,
                }}
              >
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Bloco "Explore mais vagas": liga cada landing às outras (e o /radar a
// todas). É o que dá ao Google um caminho estável até as páginas perenes.
export function RadarExploreLinks({ groups }: { groups: LandingLinkGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <section style={{ marginTop: 48 }} aria-labelledby="explore-title">
      <h2
        id="explore-title"
        style={{
          fontSize: "clamp(1.25rem,3vw,1.6rem)",
          fontWeight: 500,
          letterSpacing: -0.6,
          lineHeight: 1.15,
          margin: "0 0 16px",
          color: INK,
        }}
      >
        Explore mais vagas
      </h2>
      <div style={{ display: "grid", gap: 18 }}>
        {groups.map((group) => (
          <div key={group.title}>
            <ListTitle>{group.title}</ListTitle>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 12px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.62)",
                      border: "1px solid rgba(10,10,10,0.1)",
                      color: INK,
                      fontSize: 13.5,
                      textDecoration: "none",
                    }}
                  >
                    {link.label}
                    <span
                      style={{ fontFamily: MONO, fontSize: 11, color: FAINT }}
                    >
                      {formatCount(link.count)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
