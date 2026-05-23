"use client";

import { useRouter } from "next/navigation";
import { AT } from "./admin-primitives";

export type Period = "hoje" | "7d" | "30d" | "mes";

const PERIODS: { id: Period; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Mês atual" },
];

export function PeriodSelector({ current }: { current: Period }) {
  const router = useRouter();

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        background: AT.bgAlt,
        borderRadius: 8,
        padding: 3,
        border: `1px solid ${AT.border}`,
      }}
    >
      {PERIODS.map((p) => {
        const active = current === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => router.push(`/admin?period=${p.id}`)}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              fontFamily: '"Geist", sans-serif',
              border: active
                ? `1px solid ${AT.border}`
                : "1px solid transparent",
              cursor: "pointer",
              background: active ? AT.card : "transparent",
              color: active ? AT.ink2 : AT.muted,
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.1s",
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
