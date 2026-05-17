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

export type ActiveFilters = {
  q?: string;
  modalidade?: string;
  senioridade?: string;
  empresa?: string;
  publicada?: string;
  area?: string;
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

  if (p.get(key) === value) {
    p.delete(key);
  } else {
    p.set(key, value);
  }
  p.delete("page");
  const qs = p.toString();
  return `/vagas${qs ? `?${qs}` : ""}`;
}

type FilterGroupProps = {
  title: string;
  items: { value: string; label: string; count?: number }[];
  activeValue?: string;
  paramKey: string;
  active: ActiveFilters;
  radio?: boolean;
};

function FilterGroup({
  title,
  items,
  activeValue,
  paramKey,
  active,
  radio = false,
}: FilterGroupProps) {
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <p
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: "#8a8a85",
          fontWeight: 500,
          margin: "0 0 10px",
          paddingBottom: 6,
          borderBottom: "1px solid rgba(10,10,10,0.06)",
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => {
          const isActive = activeValue === item.value;
          return (
            <a
              key={item.value}
              href={buildToggleUrl(active, paramKey, item.value)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                textDecoration: "none",
                cursor: "pointer",
                gap: 8,
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {radio ? (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: isActive
                        ? "1.4px solid #0a0a0a"
                        : "1.4px solid rgba(10,10,10,0.25)",
                      background: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isActive ? (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "#0a0a0a",
                        }}
                      />
                    ) : null}
                  </span>
                ) : (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: isActive
                        ? "none"
                        : "1.4px solid rgba(10,10,10,0.25)",
                      background: isActive ? "#0a0a0a" : "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isActive ? (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                        <title>Selecionado</title>
                        <path
                          d="M5 12l5 5L20 7"
                          stroke="#fafaf6"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                )}
                <span
                  style={{
                    fontFamily: GEIST,
                    fontSize: 13,
                    color: isActive ? "#0a0a0a" : "#3a3a38",
                    fontWeight: isActive ? 500 : 400,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.label}
                </span>
              </span>
              {item.count !== undefined ? (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#8a8a85",
                    letterSpacing: 0.2,
                    flexShrink: 0,
                  }}
                >
                  {item.count}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function CvUploadCard() {
  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: 18,
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.02), 0 10px 28px -22px rgba(10,10,10,0.18)",
        marginBottom: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: "#fff",
            border: "1px solid rgba(10,10,10,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <title>Documento</title>
            <path
              d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"
              stroke="#0a0a0a"
              strokeWidth="1.6"
            />
            <path d="M14 3v5h5" stroke="#0a0a0a" strokeWidth="1.6" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            letterSpacing: -0.2,
            fontFamily: GEIST,
          }}
        >
          seu CV
        </div>
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: "#5a5a55",
          lineHeight: 1.55,
          marginBottom: 14,
          fontFamily: GEIST,
          margin: "0 0 14px",
        }}
      >
        Suba uma vez e veja seu{" "}
        <b style={{ color: "#0a0a0a", fontWeight: 600 }}>
          score de compatibilidade
        </b>{" "}
        em cada vaga.
      </p>
      <a
        href="/cv-base"
        style={{
          background: "#fff",
          border: "1px dashed rgba(10,10,10,0.2)",
          borderRadius: 10,
          padding: "14px 10px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 5,
          cursor: "pointer",
          textDecoration: "none",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(198,255,58,0.18)",
            border: "1px solid rgba(64,84,16,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 2,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <title>Upload</title>
            <path
              d="M12 16V4m0 0l-4 4m4-4l4 4M5 20h14"
              stroke="#0a0a0a"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#0a0a0a",
            fontFamily: GEIST,
          }}
        >
          enviar cv
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: "#8a8a85",
            letterSpacing: 0.3,
          }}
        >
          PDF até 5MB
        </div>
      </a>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: "#8a8a85",
          letterSpacing: 0.2,
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          lineHeight: 1.4,
        }}
      >
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#c6ff3a",
            flexShrink: 0,
          }}
        />
        processado localmente, dados criptografados
      </div>
    </div>
  );
}

type FiltersSidebarProps = {
  facets: PublicJobFacets | null;
  activeFilters: ActiveFilters;
};

export function FiltersSidebar({ facets, activeFilters }: FiltersSidebarProps) {
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
  ].filter(Boolean).length;

  return (
    <aside style={{ position: "sticky", top: 88, alignSelf: "start" }}>
      <CvUploadCard />

      {activeCount > 0 ? (
        <a
          href="/vagas"
          style={{
            display: "block",
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 0.5,
            color: "#3a3a38",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            textDecorationColor: "rgba(10,10,10,0.2)",
            marginBottom: 18,
            padding: "0 2px",
          }}
        >
          limpar filtros ({activeCount})
        </a>
      ) : null}

      <FilterGroup
        title="MODALIDADE"
        items={workModelItems}
        activeValue={activeFilters.modalidade}
        paramKey="modalidade"
        active={activeFilters}
      />

      {seniorityItems.length > 0 ? (
        <FilterGroup
          title="SENIORIDADE"
          items={seniorityItems}
          activeValue={activeFilters.senioridade}
          paramKey="senioridade"
          active={activeFilters}
        />
      ) : null}

      <FilterGroup
        title="PUBLICADO HÁ"
        items={PUBLISHED_OPTIONS}
        activeValue={activeFilters.publicada}
        paramKey="publicada"
        active={activeFilters}
        radio
      />

      {companyItems.length > 0 ? (
        <FilterGroup
          title="EMPRESA"
          items={companyItems}
          activeValue={activeFilters.empresa}
          paramKey="empresa"
          active={activeFilters}
        />
      ) : null}
    </aside>
  );
}
