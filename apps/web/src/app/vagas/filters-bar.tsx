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
  const currentLabel = isActive
    ? selected
        .map((v) => options.find((o) => o.value === v)?.label ?? v)
        .join(", ")
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
          background: isActive ? "#0a0a0a" : "#fafaf6",
          color: isActive ? "#fafaf6" : "#3a3a38",
          border: `1px solid ${isActive ? "#0a0a0a" : "rgba(10,10,10,0.1)"}`,
          fontSize: 12.5,
          whiteSpace: "nowrap",
          fontFamily: GEIST,
          maxWidth: 260,
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
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
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
          background: isActive ? "#0a0a0a" : "#fafaf6",
          color: isActive ? "#fafaf6" : "#3a3a38",
          border: `1px solid ${isActive ? "#0a0a0a" : "rgba(10,10,10,0.1)"}`,
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
            opacity: 0.6,
          }}
        >
          {label}
        </span>
        <span style={{ fontWeight: 500 }}>{currentLabel}</span>
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
    (publicada ? 1 : 0);

  const isDirty =
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
    if (activeFilters.q) p.set("q", activeFilters.q);
    if (activeFilters.area) p.set("area", activeFilters.area);
    if (modalidade.length > 0) p.set("modalidade", modalidade.join(","));
    if (senioridade.length > 0) p.set("senioridade", senioridade.join(","));
    if (empresa.length > 0) p.set("empresa", empresa.join(","));
    if (publicada) p.set("publicada", publicada);
    if (activeFilters.minSkillsPct)
      p.set("minSkillsPct", activeFilters.minSkillsPct);
    if (activeFilters.sort) p.set("sort", activeFilters.sort);
    const qs = p.toString();
    router.push(`/vagas${qs ? `?${qs}` : ""}`);
  }

  function clearAll() {
    setModalidade([]);
    setSenioridade([]);
    setEmpresa([]);
    setPublicada("");
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
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "10px 12px",
        flexWrap: "wrap",
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
          flexWrap: "wrap",
          flex: 1,
          minWidth: 0,
        }}
      >
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        {pendingCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: "#3a3a38",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textDecorationColor: "rgba(10,10,10,0.2)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: "transparent",
              border: "none",
              padding: 0,
            }}
          >
            limpar filtros ({pendingCount})
          </button>
        ) : null}

        <button
          type="button"
          onClick={applyFilters}
          disabled={!isDirty}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: isDirty ? "#0a0a0a" : "rgba(10,10,10,0.08)",
            color: isDirty ? "#fafaf6" : "#8a8a85",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: isDirty ? "pointer" : "default",
            fontFamily: GEIST,
            whiteSpace: "nowrap",
          }}
        >
          aplicar filtros
        </button>
      </div>
    </div>
  );
}
