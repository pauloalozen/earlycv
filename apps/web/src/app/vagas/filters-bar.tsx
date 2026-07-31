import type { PublicJobFacets } from "@/lib/public-jobs-api";

const MONO = "var(--font-geist-mono), monospace";
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

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

const PUBLISHED_OPTIONS = [
  { value: "hoje", label: "Últimas 24h" },
  { value: "3dias", label: "Últimos 3 dias" },
  { value: "semana", label: "Última semana" },
];

const SCORE_OPTIONS = [
  { value: "", label: "qualquer" },
  { value: "40", label: "40%+" },
  { value: "70", label: "70%+" },
];

export type ActiveFilters = {
  q?: string;
  modalidade?: string;
  senioridade?: string;
  empresa?: string;
  publicada?: string;
  area?: string;
  minScore?: string;
  minSkillsPct?: string;
};

function buildToggleUrl(
  active: ActiveFilters,
  key: string,
  value: string,
): string {
  const p = new URLSearchParams();
  if (active.q) p.set("q", active.q);
  if (active.publicada) p.set("publicada", active.publicada);
  if (active.modalidade) p.set("modalidade", active.modalidade);
  if (active.senioridade) p.set("senioridade", active.senioridade);
  if (active.empresa) p.set("empresa", active.empresa);
  if (active.area) p.set("area", active.area);
  if (active.minScore) p.set("minScore", active.minScore);
  if (active.minSkillsPct) p.set("minSkillsPct", active.minSkillsPct);

  if (!value || p.get(key) === value) {
    p.delete(key);
  } else {
    p.set(key, value);
  }
  p.delete("page");
  const qs = p.toString();
  return `/vagas${qs ? `?${qs}` : ""}`;
}

function Pill({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: active ? "#0a0a0a" : "#fafaf6",
        color: active ? "#fafaf6" : "#3a3a38",
        border: `1px solid ${active ? "#0a0a0a" : "rgba(10,10,10,0.1)"}`,
        borderRadius: 99,
        padding: "7px 12px",
        fontSize: 12.5,
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
        textDecoration: "none",
        whiteSpace: "nowrap",
        fontFamily: GEIST,
      }}
    >
      {label}
    </a>
  );
}

type PillGroupProps = {
  items: { value: string; label: string; count?: number }[];
  activeValue?: string;
  paramKey: string;
  active: ActiveFilters;
};

function PillGroup({ items, activeValue, paramKey, active }: PillGroupProps) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((item) => (
        <Pill
          key={item.value}
          label={
            item.count !== undefined
              ? `${item.label} (${item.count})`
              : item.label
          }
          active={activeValue === item.value}
          href={buildToggleUrl(active, paramKey, item.value)}
        />
      ))}
    </div>
  );
}

type FiltersBarProps = {
  facets: PublicJobFacets | null;
  activeFilters: ActiveFilters;
  showScoreFilters: boolean;
};

export function FiltersBar({
  facets,
  activeFilters,
  showScoreFilters,
}: FiltersBarProps) {
  const workModelItems = facets
    ? facets.workModels.map((f) => ({
        value: f.value,
        label: WORK_MODEL_LABELS[f.value] ?? f.value,
        count: f.count,
      }))
    : Object.entries(WORK_MODEL_LABELS).map(([value, label]) => ({
        value,
        label,
      }));

  const seniorityItems = facets
    ? facets.seniorityLevels.map((f) => ({
        value: f.value,
        label: SENIORITY_LABELS[f.value.toLowerCase()] ?? f.value,
        count: f.count,
      }))
    : [];

  const companyItems = facets
    ? facets.companies.map((f) => ({
        value: f.value,
        label: f.value,
        count: f.count,
      }))
    : [];

  const activeCount = [
    activeFilters.modalidade,
    activeFilters.senioridade,
    activeFilters.empresa,
    activeFilters.publicada,
    activeFilters.minScore,
    activeFilters.minSkillsPct,
  ].filter(Boolean).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "12px 16px",
        flexWrap: "wrap",
      }}
    >
      <PillGroup
        items={workModelItems}
        activeValue={activeFilters.modalidade}
        paramKey="modalidade"
        active={activeFilters}
      />
      {seniorityItems.length > 0 ? (
        <PillGroup
          items={seniorityItems}
          activeValue={activeFilters.senioridade}
          paramKey="senioridade"
          active={activeFilters}
        />
      ) : null}
      <PillGroup
        items={PUBLISHED_OPTIONS}
        activeValue={activeFilters.publicada}
        paramKey="publicada"
        active={activeFilters}
      />
      {companyItems.length > 0 ? (
        <PillGroup
          items={companyItems}
          activeValue={activeFilters.empresa}
          paramKey="empresa"
          active={activeFilters}
        />
      ) : null}

      {showScoreFilters ? (
        <>
          <div
            style={{ width: 1, height: 22, background: "rgba(10,10,10,0.08)" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                color: "#8a8a85",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              compatibilidade
            </span>
            <div
              style={{
                display: "flex",
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.1)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              {SCORE_OPTIONS.map((opt) => {
                const isActive = (activeFilters.minScore ?? "") === opt.value;
                return (
                  <a
                    key={opt.value || "any"}
                    href={buildToggleUrl(activeFilters, "minScore", opt.value)}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      color: isActive ? "#fafaf6" : "#3a3a38",
                      background: isActive ? "#0a0a0a" : "transparent",
                      fontWeight: isActive ? 500 : 400,
                      cursor: "pointer",
                      textDecoration: "none",
                      fontFamily: GEIST,
                    }}
                  >
                    {opt.label}
                  </a>
                );
              })}
            </div>
          </div>
          <div
            style={{ width: 1, height: 22, background: "rgba(10,10,10,0.08)" }}
          />
          <a
            href={buildToggleUrl(activeFilters, "minSkillsPct", "50")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid rgba(10,10,10,0.1)",
              borderRadius: 99,
              padding: "7px 12px",
              fontSize: 12.5,
              cursor: "pointer",
              textDecoration: "none",
              fontFamily: GEIST,
              ...(activeFilters.minSkillsPct
                ? {
                    background: "rgba(34,163,72,0.12)",
                    borderColor: "rgba(34,163,72,0.3)",
                    color: "#1f7a34",
                    fontWeight: 500,
                  }
                : { background: "#fafaf6", color: "#3a3a38" }),
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: activeFilters.minSkillsPct ? "#2fa84c" : "#c8c6bf",
              }}
            />
            tenho 50%+ das skills
          </a>
        </>
      ) : null}

      <div style={{ flex: 1 }} />
      {activeCount > 0 ? (
        <a
          href="/vagas"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#3a3a38",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            textDecorationColor: "rgba(10,10,10,0.2)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          limpar filtros ({activeCount})
        </a>
      ) : null}
    </div>
  );
}
