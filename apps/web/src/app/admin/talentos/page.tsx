import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminFilterBar,
  AdminPageWrap,
  AdminPagination,
  AdminPill,
  AdminStatCard,
  AdminStatsRow,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import { EmptyState } from "@/components/ui";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  type SearchTalentProfilesFilters,
  searchTalentProfiles,
  type TalentJobArea,
  type TalentSeniority,
} from "@/lib/admin-talent-profiles-api";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { TermMultiInput } from "./_components/term-multi-input";

export const metadata = buildAdminMetadata("Talentos");

const SENIORITY_OPTIONS: TalentSeniority[] = [
  "INTERN",
  "JUNIOR",
  "MID",
  "SENIOR",
  "LEAD",
  "STAFF",
  "MANAGER",
  "DIRECTOR",
];

const JOB_AREA_OPTIONS: TalentJobArea[] = [
  "DATA_AI",
  "SOFTWARE_ENGINEERING",
  "CLOUD_DEVOPS",
  "CYBERSECURITY",
  "PRODUCT",
  "DESIGN_UX",
  "QA_TEST",
  "PROJECT_AGILE",
  "ARCHITECTURE",
  "LEADERSHIP",
  "GROWTH_MARKETING",
  "BUSINESS_ANALYTICS",
  "CX_DIGITAL",
  "IT_SUPPORT",
  "ERP_FUNCTIONAL",
  "OTHER",
];

// A IA às vezes cai num trecho descritivo do CV em vez de um cargo curto
// (ex: um resumo de experiência inteiro) — nesses casos é melhor não
// mostrar nada do que exibir um parágrafo na coluna, só a senioridade.
function isPlausibleTitle(title: string | null): title is string {
  if (!title) return false;
  if (title.length > 60) return false;
  if (/[.\n]/.test(title)) return false;
  return true;
}

const inputStyle = {
  borderColor: "rgba(10,10,10,0.08)",
  background: "#fafaf6",
  color: "#2a2620",
} as const;

type TalentosPageProps = {
  searchParams: Promise<{
    page?: string;
    query?: string;
    technology?: string;
    language?: string;
    minYearsExperience?: string;
    maxYearsExperience?: string;
    seniority?: string;
    primaryArea?: string;
  }>;
};

export default async function AdminTalentosPage({
  searchParams,
}: TalentosPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/talentos");
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const filters: SearchTalentProfilesFilters = {
    page,
    pageSize: 20,
    query: params.query || undefined,
    technology: params.technology || undefined,
    language: params.language || undefined,
    minYearsExperience: params.minYearsExperience
      ? Number.parseInt(params.minYearsExperience, 10)
      : undefined,
    maxYearsExperience: params.maxYearsExperience
      ? Number.parseInt(params.maxYearsExperience, 10)
      : undefined,
    seniority: (params.seniority as TalentSeniority) || undefined,
    primaryArea: (params.primaryArea as TalentJobArea) || undefined,
  };

  let result: Awaited<ReturnType<typeof searchTalentProfiles>>;
  try {
    result = await searchTalentProfiles(filters, token);
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      "/admin/talentos",
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const {
    profiles,
    total,
    pageSize,
    registeredCount,
    seniorityBreakdown,
    technologySuggestions,
    languageSuggestions,
  } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="admin · base de talentos"
        subtitle="Busque pessoas já capturadas (cadastradas ou guests) por tecnologia, idioma, senioridade e anos de experiência."
        title="Talentos."
      />

      <AdminStatsRow cols={6}>
        <AdminStatCard label="Total no filtro" value={String(total)} />
        <AdminStatCard label="Cadastrados" value={String(registeredCount)} />
        <AdminStatCard
          label="Líder+"
          value={String(seniorityBreakdown.lider)}
        />
        <AdminStatCard
          label="Sênior"
          value={String(seniorityBreakdown.senior)}
        />
        <AdminStatCard label="Pleno" value={String(seniorityBreakdown.pleno)} />
        <AdminStatCard
          label="Júnior"
          value={String(seniorityBreakdown.junior)}
        />
      </AdminStatsRow>

      <form method="GET" id="talentos-filter" style={{ marginBottom: 16 }}>
        <AdminFilterBar>
          <input
            className="h-9 rounded-md border px-3 text-[12.5px]"
            style={{ ...inputStyle, minWidth: 220 }}
            defaultValue={params.query}
            name="query"
            placeholder="Nome ou email"
          />
          <TermMultiInput
            defaultValue={params.technology}
            minWidth={200}
            name="technology"
            placeholder="Tecnologias (ex: javascript, react, ia)"
            suggestions={technologySuggestions}
          />
          <TermMultiInput
            defaultValue={params.language}
            minWidth={180}
            name="language"
            placeholder="Idiomas (ex: inglês, espanhol)"
            suggestions={languageSuggestions}
          />
          <input
            className="h-9 rounded-md border px-3 text-[12.5px]"
            style={{ ...inputStyle, width: 110 }}
            defaultValue={params.minYearsExperience}
            min={0}
            name="minYearsExperience"
            placeholder="Anos min."
            type="number"
          />
          <input
            className="h-9 rounded-md border px-3 text-[12.5px]"
            style={{ ...inputStyle, width: 110 }}
            defaultValue={params.maxYearsExperience}
            min={0}
            name="maxYearsExperience"
            placeholder="Anos máx."
            type="number"
          />
          <select
            className="h-9 rounded-md border px-3 text-[12.5px]"
            style={inputStyle}
            defaultValue={params.seniority ?? ""}
            name="seniority"
          >
            <option value="">senioridade: todas</option>
            {SENIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border px-3 text-[12.5px]"
            style={inputStyle}
            defaultValue={params.primaryArea ?? ""}
            name="primaryArea"
          >
            <option value="">área: todas</option>
            {JOB_AREA_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button className={buttonVariants()} type="submit">
            Buscar
          </button>
        </AdminFilterBar>
      </form>

      {total === 0 ? (
        <EmptyState
          description="Nenhum talento corresponde aos filtros atuais. Ajuste a busca ou aguarde novas análises alimentarem a base."
          title="Nenhum resultado"
        />
      ) : (
        <>
          <AdminTable>
            <thead>
              <tr>
                <AdminTh>Nome</AdminTh>
                <AdminTh>Contato</AdminTh>
                <AdminTh>Localização</AdminTh>
                <AdminTh>Cargo / Senioridade</AdminTh>
                <AdminTh align="right" w={70}>
                  Anos
                </AdminTh>
                <AdminTh>Tecnologias</AdminTh>
                <AdminTh>Idiomas</AdminTh>
                <AdminTh w={90}>Origem</AdminTh>
                <AdminTh w={90}>CV</AdminTh>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <AdminTd>{profile.fullName ?? "—"}</AdminTd>
                  <AdminTd mono muted>
                    {profile.primaryEmail ?? "—"}
                    {profile.phone ? ` · ${profile.phone}` : ""}
                  </AdminTd>
                  <AdminTd muted>
                    {[profile.city, profile.state, profile.country]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </AdminTd>
                  <AdminTd>
                    {isPlausibleTitle(profile.currentTitle) ? (
                      <>
                        {profile.currentTitle}
                        {profile.seniority ? (
                          <span style={{ color: AT.muted, fontSize: 11 }}>
                            {" "}
                            · {profile.seniority}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      (profile.seniority ?? "—")
                    )}
                  </AdminTd>
                  <AdminTd align="right" mono>
                    {profile.yearsExperience ?? "—"}
                  </AdminTd>
                  <AdminTd>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {profile.technologies.length > 0
                        ? profile.technologies.map((tech) => (
                            <AdminPill key={tech} mono tone="neutral">
                              {tech}
                            </AdminPill>
                          ))
                        : "—"}
                    </div>
                  </AdminTd>
                  <AdminTd muted>
                    {profile.languages.map((l) => l.language).join(", ") || "—"}
                  </AdminTd>
                  <AdminTd>
                    <AdminPill tone={profile.userId ? "ok" : "neutral"}>
                      {profile.userId ? "cadastrado" : "guest"}
                    </AdminPill>
                  </AdminTd>
                  <AdminTd>
                    {profile.hasCvSource ? (
                      <Link
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                        href={`/admin/talentos/${profile.id}/cv`}
                        target="_blank"
                      >
                        Ver CV
                      </Link>
                    ) : (
                      <span style={{ color: AT.faint, fontSize: 11.5 }}>—</span>
                    )}
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>

          {totalPages > 1 && (
            <AdminPagination
              summary={`Página ${safePage} de ${totalPages} · ${total} talentos`}
            >
              {safePage > 1 && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref(params, safePage - 1)}
                >
                  ← Anterior
                </Link>
              )}
              {safePage < totalPages && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref(params, safePage + 1)}
                >
                  Próxima →
                </Link>
              )}
            </AdminPagination>
          )}
        </>
      )}
    </AdminPageWrap>
  );
}

function buildPageHref(
  params: Awaited<TalentosPageProps["searchParams"]>,
  page: number,
) {
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  if (params.query) qs.set("query", params.query);
  if (params.technology) qs.set("technology", params.technology);
  if (params.language) qs.set("language", params.language);
  if (params.minYearsExperience)
    qs.set("minYearsExperience", params.minYearsExperience);
  if (params.maxYearsExperience)
    qs.set("maxYearsExperience", params.maxYearsExperience);
  if (params.seniority) qs.set("seniority", params.seniority);
  if (params.primaryArea) qs.set("primaryArea", params.primaryArea);
  return `/admin/talentos?${qs}`;
}
