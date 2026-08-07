"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

type MultiFilterDropdownProps = {
  label: string;
  allLabel: string;
  options: DropdownOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
};

function MultiFilterDropdown({
  label,
  allLabel,
  options,
  selected,
  onToggle,
  onClear,
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
    <details className="vagas-filter-dropdown" style={{ position: "relative" }}>
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
          border: `1.5px solid ${isActive ? "rgba(10,10,10,0.35)" : "rgba(10,10,10,0.1)"}`,
          fontSize: 12.5,
          whiteSpace: "nowrap",
          fontFamily: GEIST,
          width: 172,
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: 0.4,
            opacity: 0.6,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
        <span
          style={{
            flex: 1,
            fontWeight: isActive ? 600 : 500,
            color: "#0a0a0a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {currentLabel}
        </span>
        <ChevronIcon />
      </summary>
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
          minWidth: 220,
          maxHeight: 280,
          overflowY: "auto",
          boxShadow: "0 8px 28px rgba(0,0,0,0.1)",
        }}
      >
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
      </div>
    </details>
  );
}

type SingleFilterDropdownProps = {
  label: string;
  allLabel: string;
  options: DropdownOption[];
  activeValue: string;
  onSelect: (value: string) => void;
};

function SingleFilterDropdown({
  label,
  allLabel,
  options,
  activeValue,
  onSelect,
}: SingleFilterDropdownProps) {
  if (options.length === 0) return null;
  const isActive = !!activeValue;
  const currentLabel = isActive
    ? (options.find((o) => o.value === activeValue)?.label ?? activeValue)
    : allLabel;

  return (
    <details className="vagas-filter-dropdown" style={{ position: "relative" }}>
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
          border: `1.5px solid ${isActive ? "rgba(10,10,10,0.35)" : "rgba(10,10,10,0.1)"}`,
          fontSize: 12.5,
          whiteSpace: "nowrap",
          fontFamily: GEIST,
          width: 208,
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: 0.4,
            opacity: 0.6,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
        <span
          style={{
            flex: 1,
            fontWeight: isActive ? 600 : 500,
            color: "#0a0a0a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {currentLabel}
        </span>
        <ChevronIcon />
      </summary>
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
          minWidth: 200,
          boxShadow: "0 8px 28px rgba(0,0,0,0.1)",
        }}
      >
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
      </div>
    </details>
  );
}

type FiltersBarProps = {
  facets: PublicJobFacets | null;
  activeFilters: ActiveFilters;
};

export function FiltersBar({ facets, activeFilters }: FiltersBarProps) {
  const router = useRouter();

  const [q, setQ] = useState(activeFilters.q ?? "");
  const [modalidade, setModalidade] = useState<string[]>(
    csv(activeFilters.modalidade),
  );
  const [senioridade, setSenioridade] = useState<string[]>(
    csv(activeFilters.senioridade),
  );
  const [empresa, setEmpresa] = useState<string[]>(csv(activeFilters.empresa));
  const [publicada, setPublicada] = useState(activeFilters.publicada ?? "");

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

  const pendingCount =
    modalidade.length +
    senioridade.length +
    empresa.length +
    (publicada ? 1 : 0) +
    (q.trim() ? 1 : 0);

  const isDirty =
    q !== (activeFilters.q ?? "") ||
    !sameSet(modalidade, csv(activeFilters.modalidade)) ||
    !sameSet(senioridade, csv(activeFilters.senioridade)) ||
    !sameSet(empresa, csv(activeFilters.empresa)) ||
    publicada !== (activeFilters.publicada ?? "");

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
  }

  function applyFilters() {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (activeFilters.area) p.set("area", activeFilters.area);
    if (modalidade.length > 0) p.set("modalidade", modalidade.join(","));
    if (senioridade.length > 0) p.set("senioridade", senioridade.join(","));
    if (empresa.length > 0) p.set("empresa", empresa.join(","));
    if (publicada) p.set("publicada", publicada);
    if (activeFilters.minSkillsPct)
      p.set("minSkillsPct", activeFilters.minSkillsPct);
    if (activeFilters.sort) p.set("sort", activeFilters.sort);
    if (activeFilters.excludeAnalyzed === "false") {
      p.set("excludeAnalyzed", "false");
    }
    const qs = p.toString();
    router.push(`/vagas${qs ? `?${qs}` : ""}`);
  }

  function clearAll() {
    setQ("");
    setModalidade([]);
    setSenioridade([]);
    setEmpresa([]);
    setPublicada("");

    // Navega direto — só resetar o estado local deixa a busca (server-side)
    // com os filtros antigos até o usuário clicar em "aplicar filtros".
    // area/minSkillsPct também somem: eram derivados de um filtro que não
    // existe mais depois do clear. sort e excludeAnalyzed não são "filtros"
    // desta barra, então continuam como estavam.
    const p = new URLSearchParams();
    if (activeFilters.sort) p.set("sort", activeFilters.sort);
    if (activeFilters.excludeAnalyzed === "false") {
      p.set("excludeAnalyzed", "false");
    }
    const qs = p.toString();
    router.push(`/vagas${qs ? `?${qs}` : ""}`);
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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        applyFilters();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "10px 12px",
        flexWrap: "nowrap",
      }}
    >
      <style>{`
        .vagas-filter-dropdown > summary::-webkit-details-marker { display: none; }
        .vagas-filter-dropdown > summary { -webkit-tap-highlight-color: transparent; }
      `}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: "1 1 auto",
            minWidth: 120,
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
            <circle cx="11" cy="11" r="7" stroke="#8a8a85" strokeWidth="1.7" />
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

        <MultiFilterDropdown
          label="MODALIDADE"
          allLabel="todas"
          options={workModelItems}
          selected={modalidade}
          onToggle={(v) => toggle(modalidade, setModalidade, v)}
          onClear={() => setModalidade([])}
        />
        <MultiFilterDropdown
          label="SENIORIDADE"
          allLabel="todas"
          options={seniorityItems}
          selected={senioridade}
          onToggle={(v) => toggle(senioridade, setSenioridade, v)}
          onClear={() => setSenioridade([])}
        />
        <MultiFilterDropdown
          label="EMPRESA"
          allLabel="todas"
          options={companyItems}
          selected={empresa}
          onToggle={(v) => toggle(empresa, setEmpresa, v)}
          onClear={() => setEmpresa([])}
        />

        <SingleFilterDropdown
          label="PUBLICADO HÁ"
          allLabel="qualquer período"
          options={PUBLISHED_OPTIONS}
          activeValue={publicada}
          onSelect={setPublicada}
        />
      </div>

      {/* Botões-ícone (com tooltip nativo via title) — largura fixa e bem
          menor que os textos, então essa área nunca disputa espaço com os
          pills à esquerda nem força a busca a encolher demais. */}
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
    </form>
  );
}
