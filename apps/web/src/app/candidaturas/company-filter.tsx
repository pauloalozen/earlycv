"use client";

import { useEffect, useId, useRef, useState } from "react";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Filtro de empresa de /candidaturas: mesmo formato dos filtros rápidos,
// lista com altura máxima (rola) e busca por texto no topo.
export function CompanyFilter({
  companies,
  value,
  onChange,
}: {
  companies: string[];
  value: string;
  onChange: (company: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const active = value !== "";

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const needle = normalize(query);
  const visibleCompanies = needle
    ? companies.filter((company) => normalize(company).includes(needle))
    : companies;

  function pick(company: string) {
    onChange(company);
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 32,
          maxWidth: 260,
          padding: "0 10px 0 12px",
          borderRadius: 999,
          border: active
            ? "1px solid #0a0a0a"
            : "1px solid rgba(10,10,10,0.10)",
          background: active ? "#0a0a0a" : "#fff",
          color: active ? "#fafaf6" : "#3a3a36",
          fontFamily: GEIST,
          fontSize: 12.5,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {active ? `Empresa: ${value}` : "Empresa"}
        </span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            transition: "transform 0.18s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 60,
            width: 260,
            background: "#fff",
            border: "1px solid rgba(10,10,10,0.09)",
            borderRadius: 12,
            boxShadow: "0 8px 28px rgba(0,0,0,0.10)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 8,
              borderBottom: "1px solid rgba(10,10,10,0.06)",
            }}
          >
            <label
              htmlFor={searchId}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
              }}
            >
              Buscar empresa
            </label>
            <input
              id={searchId}
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar empresa..."
              autoComplete="off"
              style={{
                width: "100%",
                height: 36,
                padding: "0 10px",
                borderRadius: 8,
                border: "1px solid rgba(10,10,10,0.12)",
                fontFamily: GEIST,
                fontSize: 13,
                color: "#0a0a0a",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div
            role="listbox"
            aria-label="Empresas"
            style={{ maxHeight: 280, overflowY: "auto", padding: "4px 0" }}
          >
            {needle === "" ? (
              <CompanyOption
                label="Todas as empresas"
                selected={!active}
                onSelect={() => pick("")}
              />
            ) : null}
            {visibleCompanies.map((company) => (
              <CompanyOption
                key={company}
                label={company}
                selected={value === company}
                onSelect={() => pick(company)}
              />
            ))}
            {visibleCompanies.length === 0 ? (
              <div
                style={{
                  padding: "10px 16px",
                  fontFamily: GEIST,
                  fontSize: 12.5,
                  color: "#8a8a85",
                }}
              >
                Nenhuma empresa encontrada
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CompanyOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "9px 16px",
        fontFamily: GEIST,
        fontSize: 13,
        fontWeight: selected ? 600 : 400,
        color: selected ? "#0a0a0a" : "#3a3a36",
        background: selected ? "rgba(10,10,10,0.04)" : "transparent",
        border: "none",
        cursor: "pointer",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
