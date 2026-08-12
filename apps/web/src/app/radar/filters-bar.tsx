"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PublicJobFacets } from "@/lib/public-jobs-api";
import { RADAR_AREA_LABELS, RADAR_SENIORITY_LABELS } from "./radar-ui";

const MONO = "var(--font-geist-mono), monospace";
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

const WORK_MODEL_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  "on-site": "Presencial",
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
  estado?: string;
  cidade?: string;
  minSkillsPct?: string;
  sort?: string;
  // undefined = filtro ligado (default); "false" = usuário desmarcou.
  excludeAnalyzed?: string;
};

function csv(value?: string): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function ChevronIcon() {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none">
      <title>Abrir</title>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckboxIcon({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        width: 15,
        height: 15,
        borderRadius: 4,
        border: `1.5px solid ${checked ? "#0a0a0a" : "rgba(10,10,10,0.25)"}`,
        background: checked ? "#0a0a0a" : "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {checked ? (
        <svg aria-hidden width="9" height="9" viewBox="0 0 24 24" fill="none">
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
  );
}

type DropdownOption = { value: string; label: string; count?: number };

// "pill" = pastilha horizontal (linha de filtros primários: área,
// modalidade, senioridade). "field" = caixa vertical (label em cima,
// valor+chevron embaixo) usada dentro do grid de "mais filtros".
type DropdownVariant = "pill" | "field";

function DropdownMenu({
  children,
  minWidth = 220,
}: {
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.1)",
        borderRadius: 10,
        padding: 6,
        zIndex: 20,
        minWidth,
        maxHeight: 280,
        overflowY: "auto",
        boxShadow: "0 8px 28px rgba(0,0,0,0.1)",
      }}
    >
      {children}
    </div>
  );
}

function DropdownTrigger({
  variant,
  label,
  currentLabel,
  isActive,
}: {
  variant: DropdownVariant;
  label: string;
  currentLabel: string;
  isActive: boolean;
}) {
  if (variant === "field") {
    return (
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          background: "#fff",
          border: `1px solid ${isActive ? "rgba(10,10,10,0.3)" : "rgba(10,10,10,0.1)"}`,
          borderRadius: 10,
          padding: "8px 11px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "#8a8a85",
          }}
        >
          {label}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: "#0a0a0a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {currentLabel}
          </span>
          <span style={{ color: "#8a8a85", flexShrink: 0, display: "flex" }}>
            <ChevronIcon />
          </span>
        </span>
      </summary>
    );
  }

  return (
    <summary
      title={currentLabel}
      style={{
        listStyle: "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 10px",
        borderRadius: 999,
        background: isActive ? "#fff" : "#fbfbf7",
        color: "#3a3a38",
        border: `1px solid ${isActive ? "#0a0a0a" : "rgba(10,10,10,0.1)"}`,
        boxShadow: isActive ? "0 0 0 1px #0a0a0a" : "none",
        fontSize: 12.5,
        whiteSpace: "nowrap",
        fontFamily: GEIST,
        // 100% pra acompanhar o <details> pai, que agora cresce (flex: 1 1
        // 130px) pra ocupar o espaço sobrando na barra. O texto trunca com
        // reticências (minWidth:0 no pai) e o valor completo aparece no
        // title (tooltip nativo).
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "#8a8a85",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12.5,
          fontWeight: 600,
          color: "#0a0a0a",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {currentLabel}
      </span>
      <ChevronIcon />
    </summary>
  );
}

type MultiFilterDropdownProps = {
  label: string;
  allLabel: string;
  options: DropdownOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  variant?: DropdownVariant;
};

function MultiFilterDropdown({
  label,
  allLabel,
  options,
  selected,
  onToggle,
  onClear,
  variant = "pill",
}: MultiFilterDropdownProps) {
  if (options.length === 0) return null;
  const isActive = selected.length > 0;
  // Rótulo com largura previsível — listar todos os valores selecionados
  // faria a pill crescer sem limite e quebrar a linha de filtros (ex:
  // "Remoto, Híbrido, onsite"). Acima de 1 item, mostra só a contagem.
  const currentLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selecionadas`;

  return (
    <details
      className="vagas-filter-dropdown"
      style={{
        position: "relative",
        width: variant === "field" ? "100%" : undefined,
        // Cresce pra usar o espaço sobrando na barra em vez de deixar
        // vazio depois do "mais filtros" — a base (130px) é só o piso
        // mínimo antes de crescer, não o tamanho fixo final.
        flex: variant === "pill" ? "1 1 130px" : undefined,
        minWidth: variant === "pill" ? 0 : undefined,
      }}
    >
      <DropdownTrigger
        variant={variant}
        label={label}
        currentLabel={currentLabel}
        isActive={isActive}
      />
      <DropdownMenu>
        <button
          type="button"
          onClick={onClear}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 12,
            fontFamily: MONO,
            letterSpacing: 0.2,
            color: "#8a8a85",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          {allLabel}
        </button>
        {options.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 7,
                fontSize: 13,
                color: "#0a0a0a",
                background: checked ? "rgba(10,10,10,0.05)" : "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <CheckboxIcon checked={checked} />
                {opt.label}
              </span>
              {opt.count !== undefined ? (
                <span
                  style={{ fontFamily: MONO, fontSize: 11, color: "#8a8a85" }}
                >
                  {opt.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </DropdownMenu>
    </details>
  );
}

type SingleFilterDropdownProps = {
  label: string;
  allLabel: string;
  options: DropdownOption[];
  activeValue: string;
  onSelect: (value: string) => void;
  variant?: DropdownVariant;
};

function SingleFilterDropdown({
  label,
  allLabel,
  options,
  activeValue,
  onSelect,
  variant = "pill",
}: SingleFilterDropdownProps) {
  if (options.length === 0) return null;
  const isActive = !!activeValue;
  const currentLabel = isActive
    ? (options.find((o) => o.value === activeValue)?.label ?? activeValue)
    : allLabel;

  return (
    <details
      className="vagas-filter-dropdown"
      style={{
        position: "relative",
        width: variant === "field" ? "100%" : undefined,
        // Cresce pra usar o espaço sobrando na barra em vez de deixar
        // vazio depois do "mais filtros" — a base (130px) é só o piso
        // mínimo antes de crescer, não o tamanho fixo final.
        flex: variant === "pill" ? "1 1 130px" : undefined,
        minWidth: variant === "pill" ? 0 : undefined,
      }}
    >
      <DropdownTrigger
        variant={variant}
        label={label}
        currentLabel={currentLabel}
        isActive={isActive}
      />
      <DropdownMenu>
        <button
          type="button"
          onClick={() => onSelect("")}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 13,
            color: isActive ? "#3a3a38" : "#0a0a0a",
            fontWeight: isActive ? 400 : 600,
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          {allLabel}
        </button>
        {options.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "7px 10px",
              borderRadius: 7,
              fontSize: 13,
              color: activeValue === opt.value ? "#0a0a0a" : "#3a3a38",
              fontWeight: activeValue === opt.value ? 600 : 400,
              background:
                activeValue === opt.value
                  ? "rgba(10,10,10,0.05)"
                  : "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </DropdownMenu>
    </details>
  );
}

type FiltersBarProps = {
  facets: PublicJobFacets | null;
  activeFilters: ActiveFilters;
  // Base pras navegações desta barra (aplicar/limpar/remover tag). Default
  // "/radar" preserva o comportamento original. Landing pages (ex.:
  // /radar/area/data_ai) passam seu próprio basePath.
  basePath?: string;
  // Filtros cujo controle (pill + tag em "filtros ativos") não deve
  // aparecer — usado quando a landing page já fixa aquela dimensão pelo
  // path (ex.: /radar/area/data_ai nunca mostra o dropdown de ÁREA nem um
  // chip pra ele; o contexto é comunicado pelo h1 da página, não por um
  // chip bloqueado ou removível). O valor fixo em si não passa por aqui —
  // quem decide o filtro fixo é a camada de dados (RadarJobsListing); esta
  // prop só esconde o controle.
  hiddenFilters?: Array<"area" | "modalidade" | "senioridade" | "empresa">;
};

export function FiltersBar({
  facets,
  activeFilters,
  basePath = "/radar",
  hiddenFilters = [],
}: FiltersBarProps) {
  const router = useRouter();

  const [q, setQ] = useState(activeFilters.q ?? "");
  const [modalidade, setModalidade] = useState<string[]>(
    csv(activeFilters.modalidade),
  );
  const [senioridade, setSenioridade] = useState<string[]>(
    csv(activeFilters.senioridade),
  );
  const [area, setArea] = useState<string[]>(csv(activeFilters.area));
  const [empresa, setEmpresa] = useState<string[]>(csv(activeFilters.empresa));
  const [estado, setEstado] = useState<string[]>(csv(activeFilters.estado));
  const [cidade, setCidade] = useState<string[]>(csv(activeFilters.cidade));
  const [publicada, setPublicada] = useState(activeFilters.publicada ?? "");
  const [panelOpen, setPanelOpen] = useState(false);
  // Overflow do painel só fica "visible" depois que a animação de abertura
  // termina — precisa ficar "hidden" durante a transição pra criar o efeito
  // de deslizar (senão o conteúdo já apareceria inteiro por cima da caixa
  // ainda "crescendo"), mas depois de aberto precisa virar "visible" pra
  // não cortar os dropdowns de estado/cidade/empresa/publicado há, que são
  // absolutamente posicionados dentro dele.
  const [panelSettled, setPanelSettled] = useState(false);

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

  const areaItems = facets
    ? facets.areas.map((f) => ({
        value: f.value,
        label: RADAR_AREA_LABELS[f.value] ?? f.value,
        count: f.count,
      }))
    : [];

  const seniorityItems = facets
    ? facets.seniorities.map((f) => ({
        value: f.value,
        label: RADAR_SENIORITY_LABELS[f.value] ?? f.value,
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

  const stateItems = facets
    ? facets.states.map((f) => ({
        value: f.value,
        label: f.label,
        count: f.count,
      }))
    : [];

  const cityItems = facets
    ? facets.cities.map((f) => ({
        value: f.value,
        label: f.value,
        count: f.count,
      }))
    : [];

  // Contagem separada por seção: primária (sempre visível) vs adicional
  // (dentro do painel "mais filtros") — o badge do botão "mais filtros" só
  // reflete a segunda.
  const additionalPendingCount =
    estado.length + cidade.length + empresa.length + (publicada ? 1 : 0);
  const pendingCount =
    modalidade.length +
    senioridade.length +
    area.length +
    additionalPendingCount +
    (q.trim() ? 1 : 0);

  // Filtros ficam pendentes até o botão de aplicar (ícone de check) ser
  // clicado — nenhum toggle/seleção navega sozinho. `isDirty` decide se
  // esse botão fica habilitado.
  const isDirty =
    q !== (activeFilters.q ?? "") ||
    !sameSet(modalidade, csv(activeFilters.modalidade)) ||
    !sameSet(senioridade, csv(activeFilters.senioridade)) ||
    !sameSet(area, csv(activeFilters.area)) ||
    !sameSet(empresa, csv(activeFilters.empresa)) ||
    !sameSet(estado, csv(activeFilters.estado)) ||
    !sameSet(cidade, csv(activeFilters.cidade)) ||
    publicada !== (activeFilters.publicada ?? "");

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
  }

  // Cidade é relacionada ao estado (facet de cidade já vem escopado pro
  // estado aplicado, ver page.tsx/getPublicJobFacets) — qualquer mudança
  // em estado antes de aplicar invalida a cidade já selecionada, então
  // limpa junto pra nunca deixar uma combinação estado+cidade impossível
  // na URL (ex: estado=RJ&cidade=Campinas, que nunca bate vaga nenhuma).
  function toggleEstado(value: string) {
    toggle(estado, setEstado, value);
    setCidade([]);
  }

  function clearEstado() {
    setEstado([]);
    setCidade([]);
  }

  function buildAppliedParams(overrides: Partial<Record<string, string>>) {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      q: activeFilters.q,
      area: activeFilters.area,
      modalidade: activeFilters.modalidade,
      senioridade: activeFilters.senioridade,
      empresa: activeFilters.empresa,
      estado: activeFilters.estado,
      cidade: activeFilters.cidade,
      publicada: activeFilters.publicada,
      sort: activeFilters.sort,
      excludeAnalyzed:
        activeFilters.excludeAnalyzed === "false" ? "false" : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(base)) {
      if (value) p.set(key, value);
    }
    return p;
  }

  // Único gatilho que de fato navega com o estado pendente: Enter na busca
  // (via submit do form) ou o botão de check no topo da barra.
  function applyFilters() {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (area.length > 0) p.set("area", area.join(","));
    if (modalidade.length > 0) p.set("modalidade", modalidade.join(","));
    if (senioridade.length > 0) p.set("senioridade", senioridade.join(","));
    if (empresa.length > 0) p.set("empresa", empresa.join(","));
    if (estado.length > 0) p.set("estado", estado.join(","));
    if (cidade.length > 0) p.set("cidade", cidade.join(","));
    if (publicada) p.set("publicada", publicada);
    if (activeFilters.minSkillsPct)
      p.set("minSkillsPct", activeFilters.minSkillsPct);
    if (activeFilters.sort) p.set("sort", activeFilters.sort);
    if (activeFilters.excludeAnalyzed === "false") {
      p.set("excludeAnalyzed", "false");
    }
    const qs = p.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  function clearAll() {
    setQ("");
    setModalidade([]);
    setSenioridade([]);
    setArea([]);
    setEmpresa([]);
    setEstado([]);
    setCidade([]);
    setPublicada("");

    // Navega direto — botões de "limpar" são ações decisivas, diferente dos
    // toggles individuais, que ficam pendentes até aplicar. minSkillsPct
    // some junto (era derivado de um filtro que não existe mais depois do
    // clear); sort/excludeAnalyzed não são "filtros" desta barra e
    // continuam como estavam.
    const p = new URLSearchParams();
    if (activeFilters.sort) p.set("sort", activeFilters.sort);
    if (activeFilters.excludeAnalyzed === "false") {
      p.set("excludeAnalyzed", "false");
    }
    const qs = p.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  // Limpa só os 4 campos do painel "mais filtros" (local + já aplicado),
  // preservando busca/área/modalidade/senioridade aplicados — mesma lógica
  // "decisiva, navega na hora" de clearAll().
  function clearAdditional() {
    setEstado([]);
    setCidade([]);
    setEmpresa([]);
    setPublicada("");

    const p = buildAppliedParams({
      empresa: undefined,
      estado: undefined,
      cidade: undefined,
      publicada: undefined,
    });
    const qs = p.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  // Remove um único valor de um filtro já aplicado (clique no "x" de uma
  // tag em "filtros ativos") e navega na hora — a tag representa algo que
  // já está no ar, então tirar ela tem efeito imediato, diferente do resto
  // da barra (que fica pendente até aplicar).
  function removeAppliedValue(key: keyof ActiveFilters, value?: string) {
    const current = csv(activeFilters[key]);
    const next = value ? current.filter((v) => v !== value) : [];
    const p = buildAppliedParams({
      [key]: next.length > 0 ? next.join(",") : undefined,
    });
    const qs = p.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  // Fecha qualquer dropdown aberto (<details class="vagas-filter-dropdown">)
  // quando o clique acontece fora dele — <details> nativo só fecha via
  // clique no próprio <summary>, então sem isso os outros ficam abertos.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const openDropdowns = document.querySelectorAll(
        ".vagas-filter-dropdown[open]",
      );
      for (const dropdown of openDropdowns) {
        if (!dropdown.contains(event.target as Node)) {
          dropdown.removeAttribute("open");
        }
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const areaTags = csv(activeFilters.area).map((v) => ({
    filterKey: "area" as const,
    value: v,
    filterLabel: "área",
    valueLabel: RADAR_AREA_LABELS[v] ?? v,
  }));
  const modalidadeTags = csv(activeFilters.modalidade).map((v) => ({
    filterKey: "modalidade" as const,
    value: v,
    filterLabel: "modalidade",
    valueLabel: WORK_MODEL_LABELS[v] ?? v,
  }));
  const senioridadeTags = csv(activeFilters.senioridade).map((v) => ({
    filterKey: "senioridade" as const,
    value: v,
    filterLabel: "senioridade",
    valueLabel: RADAR_SENIORITY_LABELS[v] ?? v,
  }));
  const estadoTags = csv(activeFilters.estado).map((v) => ({
    filterKey: "estado" as const,
    value: v,
    filterLabel: "estado",
    valueLabel: stateItems.find((o) => o.value === v)?.label ?? v,
  }));
  const cidadeTags = csv(activeFilters.cidade).map((v) => ({
    filterKey: "cidade" as const,
    value: v,
    filterLabel: "cidade",
    valueLabel: v,
  }));
  const empresaTags = csv(activeFilters.empresa).map((v) => ({
    filterKey: "empresa" as const,
    value: v,
    filterLabel: "empresa",
    valueLabel: v,
  }));
  const publicadaTags = activeFilters.publicada
    ? [
        {
          filterKey: "publicada" as const,
          value: undefined,
          filterLabel: "publicado há",
          valueLabel:
            PUBLISHED_OPTIONS.find((o) => o.value === activeFilters.publicada)
              ?.label ?? activeFilters.publicada,
        },
      ]
    : [];
  const qTag = activeFilters.q
    ? [
        {
          filterKey: "q" as const,
          value: undefined,
          filterLabel: "busca",
          valueLabel: activeFilters.q,
        },
      ]
    : [];

  const activeTags = [
    ...qTag,
    ...areaTags,
    ...modalidadeTags,
    ...senioridadeTags,
    ...estadoTags,
    ...cidadeTags,
    ...empresaTags,
    ...publicadaTags,
  ];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        applyFilters();
      }}
    >
      <style>{`
        .vagas-filter-dropdown > summary::-webkit-details-marker { display: none; }
        .vagas-filter-dropdown > summary { -webkit-tap-highlight-color: transparent; }
        .radar-filters-primary { flex-wrap: wrap; }
        .radar-filters-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (max-width: 640px) {
          .radar-filters-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
      {/* Sem overflow:hidden aqui — clipava os menus dos dropdowns (área/
      senioridade/modalidade/estado/cidade/empresa/publicado há), que só
      mostravam as primeiras opções em vez da lista inteira. Os cantos
      arredondados de baixo do painel "mais filtros" são resolvidos
      diretamente nele (ver mais abaixo), não por clipping do container. */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.08)",
          borderRadius: 14,
        }}
      >
        {/* Linha principal: busca + pills primárias (área/modalidade/
        senioridade) + botão "mais filtros" + ações de aplicar/limpar. Sem
        wrap aqui de propósito — os botões de limpar/aplicar não podem cair
        pra uma segunda linha; quem cede espaço em telas estreitas é o bloco
        de pills (via .radar-filters-primary, que tem seu próprio wrap). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px 10px 16px",
            flexWrap: "nowrap",
          }}
        >
          <div
            className="radar-filters-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: "1 1 auto",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                // Cresce mais que as pills (2 1 220px vs 1 1 130px delas) —
                // é o campo mais usado da barra e não pode ficar comprimido.
                flex: "2 1 220px",
                minWidth: 140,
                padding: "8px 10px",
              }}
            >
              <svg
                aria-hidden
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                style={{ flexShrink: 0 }}
              >
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
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Cargo, tecnologia, empresa…"
                style={{
                  flex: 1,
                  minWidth: 0,
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
                  fontSize: 10,
                  color: "#8a8a85",
                  background: "rgba(10,10,10,0.05)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                ⌘K
              </span>
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

            {hiddenFilters.includes("area") ? null : (
              <MultiFilterDropdown
                label="ÁREA"
                allLabel="todas"
                options={areaItems}
                selected={area}
                onToggle={(v) => toggle(area, setArea, v)}
                onClear={() => setArea([])}
              />
            )}
            {hiddenFilters.includes("senioridade") ? null : (
              <MultiFilterDropdown
                label="SENIORIDADE"
                allLabel="todas"
                options={seniorityItems}
                selected={senioridade}
                onToggle={(v) => toggle(senioridade, setSenioridade, v)}
                onClear={() => setSenioridade([])}
              />
            )}
            {hiddenFilters.includes("modalidade") ? null : (
              <MultiFilterDropdown
                label="MODALIDADE"
                allLabel="todas"
                options={workModelItems}
                selected={modalidade}
                onToggle={(v) => toggle(modalidade, setModalidade, v)}
                onClear={() => setModalidade([])}
              />
            )}

            <button
              type="button"
              onClick={() => {
                setPanelOpen((v) => {
                  const next = !v;
                  if (!next) setPanelSettled(false);
                  return next;
                });
              }}
              aria-expanded={panelOpen}
              aria-controls="radar-more-filters-panel"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: panelOpen ? "#fff" : "#fbfbf7",
                border: `1px solid ${panelOpen ? "#0a0a0a" : "rgba(10,10,10,0.1)"}`,
                boxShadow: panelOpen ? "0 0 0 1px #0a0a0a" : "none",
                borderRadius: 999,
                padding: "7px 11px",
                fontFamily: GEIST,
                fontSize: 12.5,
                fontWeight: 500,
                color: "#3a3a38",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <svg
                aria-hidden
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
              >
                <title>Mais filtros</title>
                <path
                  d="M4 6h16M7 12h10M10 18h4"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
              mais filtros
              {additionalPendingCount > 0 ? (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    fontWeight: 700,
                    background: "#0a0a0a",
                    color: "#c6ff3a",
                    borderRadius: 99,
                    minWidth: 16,
                    height: 16,
                    display: "grid",
                    placeItems: "center",
                    padding: "0 4px",
                  }}
                >
                  {additionalPendingCount}
                </span>
              ) : null}
              <span
                aria-hidden
                style={{
                  display: "flex",
                  transition: "transform .18s",
                  transform: panelOpen ? "rotate(180deg)" : "none",
                }}
              >
                <ChevronIcon />
              </span>
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={clearAll}
              title={`limpar filtros (${pendingCount})`}
              aria-label={`limpar filtros (${pendingCount})`}
              aria-hidden={pendingCount === 0}
              tabIndex={pendingCount === 0 ? -1 : 0}
              style={{
                width: 34,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.1)",
                color: "#3a3a38",
                cursor: pendingCount > 0 ? "pointer" : "default",
                visibility: pendingCount > 0 ? "visible" : "hidden",
                pointerEvents: pendingCount > 0 ? "auto" : "none",
                flexShrink: 0,
              }}
            >
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
              >
                <title>Limpar filtros</title>
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M9 9l6 6M15 9l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <button
              type="submit"
              disabled={!isDirty}
              title="aplicar filtros"
              aria-label="aplicar filtros"
              style={{
                width: 34,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isDirty ? "#0a0a0a" : "rgba(10,10,10,0.08)",
                color: isDirty ? "#fafaf6" : "#8a8a85",
                border: "none",
                borderRadius: 8,
                cursor: isDirty ? "pointer" : "default",
                flexShrink: 0,
              }}
            >
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
              >
                <title>Aplicar filtros</title>
                <path
                  d="M5 12l5 5L20 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Painel "mais filtros": estado/cidade/empresa/publicado há, em
        grid — desliza suave ao abrir/fechar via grid-template-rows (0fr →
        1fr), que anima com base na altura real do conteúdo em vez de um
        max-height fixo (max-height fixo faz o "reveal" acontecer rápido
        demais quando o alvo é bem maior que o conteúdo de verdade — a
        transição inteira de 0→altura-real acontece só no começo da faixa
        0→max-height). overflow só vira "visible" depois que a animação de
        abertura termina (ver onTransitionEnd), pra não cortar os dropdowns
        internos. */}
        <div
          id="radar-more-filters-panel"
          style={{
            display: "grid",
            gridTemplateRows: panelOpen ? "1fr" : "0fr",
            transition: "grid-template-rows 320ms ease",
          }}
          onTransitionEnd={(event) => {
            if (event.propertyName === "grid-template-rows" && panelOpen) {
              setPanelSettled(true);
            }
          }}
        >
          <div
            style={{
              overflow: panelSettled ? "visible" : "hidden",
              minHeight: 0,
            }}
          >
            <div
              style={{
                borderTop: "1px solid rgba(10,10,10,0.06)",
                background: "#fbfbf7",
                padding: 16,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 14,
              }}
            >
              <div className="radar-filters-grid">
                <MultiFilterDropdown
                  label="ESTADO"
                  allLabel="todos"
                  options={stateItems}
                  selected={estado}
                  onToggle={toggleEstado}
                  onClear={clearEstado}
                  variant="field"
                />
                <MultiFilterDropdown
                  label="CIDADE"
                  allLabel="todas"
                  options={cityItems}
                  selected={cidade}
                  onToggle={(v) => toggle(cidade, setCidade, v)}
                  onClear={() => setCidade([])}
                  variant="field"
                />
                {hiddenFilters.includes("empresa") ? null : (
                  <MultiFilterDropdown
                    label="EMPRESA"
                    allLabel="todas"
                    options={companyItems}
                    selected={empresa}
                    onToggle={(v) => toggle(empresa, setEmpresa, v)}
                    onClear={() => setEmpresa([])}
                    variant="field"
                  />
                )}
                <SingleFilterDropdown
                  label="PUBLICADO HÁ"
                  allLabel="qualquer período"
                  options={PUBLISHED_OPTIONS}
                  activeValue={publicada}
                  onSelect={setPublicada}
                  variant="field"
                />
              </div>

              {additionalPendingCount > 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 14,
                    paddingTop: 13,
                    borderTop: "1px solid rgba(10,10,10,0.08)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{ fontFamily: MONO, fontSize: 10, color: "#8a8a85" }}
                  >
                    {`${additionalPendingCount} filtro${additionalPendingCount > 1 ? "s" : ""} adicional${additionalPendingCount > 1 ? "is" : ""} ativo${additionalPendingCount > 1 ? "s" : ""}`}
                  </span>
                  <button
                    type="button"
                    onClick={clearAdditional}
                    style={{
                      background: "transparent",
                      border: "none",
                      fontFamily: GEIST,
                      fontSize: 12.5,
                      color: "#6a6560",
                      cursor: "pointer",
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                    }}
                  >
                    limpar adicionais
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Filtros ativos: reflete o que já está aplicado (activeFilters),
      não o estado pendente acima — cada tag remove só aquele valor e
      navega na hora. */}
      {activeTags.length > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "#8a8a85",
              marginRight: 2,
            }}
          >
            filtros ativos
          </span>
          {activeTags.map((tag) => (
            <span
              key={`${tag.filterKey}:${tag.value ?? ""}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.1)",
                borderRadius: 999,
                padding: "5px 8px 5px 11px",
                fontSize: 12,
                color: "#3a3a38",
              }}
            >
              {tag.filterLabel}:{" "}
              <b style={{ fontWeight: 600, color: "#0a0a0a" }}>
                {tag.valueLabel}
              </b>
              <button
                type="button"
                onClick={() => removeAppliedValue(tag.filterKey, tag.value)}
                aria-label={`remover filtro ${tag.filterLabel}: ${tag.valueLabel}`}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  background: "#f0efe8",
                  border: "none",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  padding: 0,
                }}
              >
                <svg
                  aria-hidden
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <title>Remover</title>
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="#6a6560"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: "#8a8a85",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            limpar tudo
          </button>
        </div>
      ) : null}
    </form>
  );
}
