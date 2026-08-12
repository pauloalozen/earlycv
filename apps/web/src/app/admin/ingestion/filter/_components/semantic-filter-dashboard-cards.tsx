"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminStatsRow, AT } from "@/app/admin/_components/admin-primitives";
import type { EnrichmentStatusValue } from "@/lib/admin-semantic-filter-api";

type Dashboard = {
  approvalRatePct: number | null;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
  skipped: number;
};

type CardStatus = EnrichmentStatusValue;

function buildHref(
  status: CardStatus | null,
  currentFilters: { search?: string; sourceId?: string },
) {
  const params = new URLSearchParams({ tab: "enrichment" });
  if (status) params.set("enrichStatus", status);
  if (currentFilters.search) params.set("search", currentFilters.search);
  if (currentFilters.sourceId) params.set("sourceId", currentFilters.sourceId);
  return `/admin/ingestion?${params}`;
}

function Card({
  label,
  value,
  danger,
  active,
  href,
}: {
  active?: boolean;
  danger?: boolean;
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      style={{
        background: danger ? "#fef2f2" : AT.card,
        border: `1px solid ${active ? AT.ink : danger ? "rgba(239,68,68,0.25)" : AT.border}`,
        borderRadius: 10,
        display: "block",
        padding: "16px 18px",
        textDecoration: "none",
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
    </Link>
  );
}

export function SemanticFilterDashboardCards({
  activeStatus,
  search,
  sourceId,
}: {
  activeStatus?: CardStatus;
  search?: string;
  sourceId?: string;
}) {
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

  const filters = { search, sourceId };

  return (
    <div style={{ marginBottom: 20 }}>
      <AdminStatsRow cols={5}>
        <Card
          active={activeStatus === "PENDING"}
          href={buildHref("PENDING", filters)}
          label="Pending"
          value={data === null ? "—" : String(data.pending)}
        />
        <Card
          active={activeStatus === "PROCESSING"}
          href={buildHref("PROCESSING", filters)}
          label="Processing"
          value={data === null ? "—" : String(data.processing)}
        />
        <Card
          active={activeStatus === "COMPLETED"}
          href={buildHref("COMPLETED", filters)}
          label="Completed"
          value={data === null ? "—" : String(data.completed)}
        />
        <Card
          active={activeStatus === "SKIPPED"}
          href={buildHref("SKIPPED", filters)}
          label="Skipped"
          value={data === null ? "—" : String(data.skipped)}
        />
        <Card
          active={activeStatus === "FAILED"}
          danger={Boolean(data && data.failed > 0)}
          href={buildHref("FAILED", filters)}
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
        Taxa de aprovacao do filtro:{" "}
        {data?.approvalRatePct === null || data?.approvalRatePct === undefined
          ? "—"
          : `${data.approvalRatePct}%`}
      </p>
    </div>
  );
}
