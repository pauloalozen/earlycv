"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AT } from "@/app/admin/_components/admin-primitives";
import type { EmailsPeriod } from "@/lib/admin-emails-api";

const PERIODS: { id: EmailsPeriod; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "mes", label: "Mês atual" },
  { id: "30d", label: "Últimos 30 dias" },
];

export function EmailsPeriodSelector({
  basePath,
  period,
  fromDate,
  toDate,
}: {
  basePath: string;
  period: EmailsPeriod | "custom";
  fromDate: string;
  toDate: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);
  const validRange = from !== "" && to !== "" && from <= to;

  const inputStyle = {
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 12,
    border: `1px solid ${AT.border}`,
    background: AT.card,
    color: AT.ink2,
  } as const;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      <fieldset
        aria-label="Período"
        style={{
          margin: 0,
          display: "inline-flex",
          flexWrap: "wrap",
          gap: 2,
          background: AT.bgAlt,
          borderRadius: 8,
          padding: 3,
          border: `1px solid ${AT.border}`,
        }}
      >
        {PERIODS.map((p) => {
          const active = period === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() =>
                router.push(`${basePath}?period=${p.id}`, { scroll: false })
              }
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                border: active
                  ? `1px solid ${AT.border}`
                  : "1px solid transparent",
                cursor: "pointer",
                background: active ? AT.card : "transparent",
                color: active ? AT.ink2 : AT.muted,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </fieldset>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (validRange)
            router.push(`${basePath}?from=${from}&to=${to}`, { scroll: false });
        }}
        style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
      >
        <input
          type="date"
          aria-label="Data inicial"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          style={inputStyle}
        />
        <span style={{ fontSize: 12, color: AT.muted }}>até</span>
        <input
          type="date"
          aria-label="Data final"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={!validRange}
          style={{
            ...inputStyle,
            cursor: validRange ? "pointer" : "not-allowed",
            fontWeight: period === "custom" ? 600 : 400,
          }}
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}
