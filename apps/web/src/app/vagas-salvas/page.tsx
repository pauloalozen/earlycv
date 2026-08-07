import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { listSavedJobs } from "@/lib/saved-jobs-api";
import { JobCard } from "../vagas/job-card";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const LIMIT = 20;

const SORT_VALUES = ["date_desc", "date_asc"] as const;
type SortValue = (typeof SORT_VALUES)[number];
const SORT_LABELS: Record<SortValue, string> = {
  date_desc: "salvas: mais recentes",
  date_asc: "salvas: mais antigas",
};

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Minhas Vagas Salvas | EarlyCV",
};

type Props = {
  searchParams: Promise<{ page?: string; sort?: string }>;
};

export default async function VagasSalvasPage({ searchParams }: Props) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/vagas-salvas", user);
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sort: SortValue = SORT_VALUES.includes(params.sort as SortValue)
    ? (params.sort as SortValue)
    : "date_desc";

  const { items, total } = await listSavedJobs(page, LIMIT, sort).catch(() => ({
    items: [],
    total: 0,
    page: 1,
    limit: LIMIT,
  }));

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function buildUrl(targetPage: number, sortValue: SortValue) {
    const p = new URLSearchParams();
    if (sortValue !== "date_desc") p.set("sort", sortValue);
    if (targetPage > 1) p.set("page", String(targetPage));
    const qs = p.toString();
    return `/vagas-salvas${qs ? `?${qs}` : ""}`;
  }

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
      <PublicNavBar hideHowItWorksLink fixed />

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "120px clamp(16px,4vw,48px) 80px",
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
          }}
        >
          <Link
            href="/vagas"
            style={{ color: "#5a5a55", textDecoration: "none" }}
          >
            Vagas
          </Link>
          <span style={{ color: "#c8c6bf" }}>›</span>
          <span style={{ color: "#0a0a0a" }}>Salvas</span>
        </nav>

        <header
          style={{
            marginBottom: 28,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "clamp(1.75rem,4vw,2.5rem)",
                fontWeight: 500,
                letterSpacing: -1.2,
                margin: "0 0 8px",
                color: "#0a0a0a",
              }}
            >
              Minhas vagas salvas
            </h1>
            <p style={{ fontSize: 14, color: "#5a5a55", margin: 0 }}>
              {total === 0
                ? "Vagas que você salvar em /vagas aparecem aqui."
                : `${total} ${total === 1 ? "vaga salva" : "vagas salvas"}.`}
            </p>
          </div>

          {total > 0 ? (
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
                  minWidth: 200,
                  boxShadow: "0 8px 28px rgba(0,0,0,0.1)",
                }}
              >
                {SORT_VALUES.map((value) => (
                  <a
                    key={value}
                    href={buildUrl(1, value)}
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
          ) : null}
        </header>

        {items.length === 0 ? (
          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 14,
              padding: "40px 24px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 14, color: "#5a5a55", margin: "0 0 16px" }}>
              Você ainda não salvou nenhuma vaga.
            </p>
            <Link
              href="/vagas"
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
              Ver vagas →
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map(({ savedJobId, job }) => (
              <JobCard
                key={savedJobId}
                job={job}
                adaptarHref="/adaptar"
                showScore
                isLoggedIn
              />
            ))}
          </div>
        )}

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
              página {page} de {totalPages} · {total} vagas
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {page > 1 ? (
                <a
                  href={buildUrl(page - 1, sort)}
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
                    href={buildUrl(p, sort)}
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
                  href={buildUrl(page + 1, sort)}
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
