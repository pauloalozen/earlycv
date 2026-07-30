"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminStatsRow, AT } from "@/app/admin/_components/admin-primitives";

type Dashboard = {
  approvalRatePct: number | null;
  completed24h: number;
  failed: number;
  pending: number;
  processing: number;
  skipped24h: number;
};

function Card({
  label,
  value,
  danger,
}: {
  danger?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        background: danger ? "#fef2f2" : AT.card,
        border: `1px solid ${danger ? "rgba(239,68,68,0.25)" : AT.border}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 10,
          letterSpacing: 1.1,
          color: AT.muted2,
          fontWeight: 500,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: -1.2,
          color: danger ? "#b91c1c" : AT.ink2,
          lineHeight: 1,
          marginTop: 8,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function SemanticFilterDashboardCards() {
  const [data, setData] = useState<Dashboard | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/semantic-filter/dashboard");
      if (res.ok) setData(await res.json());
    } catch {
      // silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const id = setInterval(fetchDashboard, 30_000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  const dash = data === null ? "—" : String(data.pending);

  return (
    <div style={{ marginBottom: 20 }}>
      <AdminStatsRow cols={5}>
        <Card label="Pending" value={dash} />
        <Card
          label="Processing"
          value={data === null ? "—" : String(data.processing)}
        />
        <Card
          label="Completed (24h)"
          value={data === null ? "—" : String(data.completed24h)}
        />
        <Card
          label="Skipped (24h)"
          value={data === null ? "—" : String(data.skipped24h)}
        />
        <Card
          danger={Boolean(data && data.failed > 0)}
          label="Failed"
          value={data === null ? "—" : String(data.failed)}
        />
      </AdminStatsRow>
      <p
        style={{
          fontSize: 12,
          color: AT.muted,
          fontFamily: '"Geist Mono", monospace',
          marginTop: -8,
        }}
      >
        Taxa de aprovacao do filtro (24h):{" "}
        {data?.approvalRatePct === null || data?.approvalRatePct === undefined
          ? "—"
          : `${data.approvalRatePct}%`}
      </p>
    </div>
  );
}
