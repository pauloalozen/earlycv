"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";

type AdapterRow = {
  adapterType: string;
  totalSources: number;
  activeSources: number;
  pausedSources: number;
  sourcesWith403: number;
  lastRunAt: string | null;
  runsLast24h: number;
  failedRunsLast24h: number;
  newJobsLast24h: number;
  nextJobRunAt: string | null;
};

function formatPast(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

function formatFuture(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "agora";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `em ${minutes}min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `em ${hours}h`;
  return `em ${Math.round(hours / 24)}d`;
}

function rowTone(row: AdapterRow): "ok" | "warn" | "danger" {
  if (row.pausedSources > 0 || row.failedRunsLast24h > 0) return "danger";
  if (row.sourcesWith403 > 0) return "warn";
  return "ok";
}

const TONE_BG: Record<"ok" | "warn" | "danger", string> = {
  ok: "transparent",
  warn: AT.warnBg,
  danger: AT.dangerBg,
};

export function DashboardAdapterTable() {
  const router = useRouter();
  const [data, setData] = useState<{ adapters: AdapterRow[] } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard/ingestion-by-adapter");
      if (res.ok) setData(await res.json());
    } catch {
      // silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <AdminTable>
      <thead>
        <tr>
          <AdminTh>Adapter</AdminTh>
          <AdminTh align="right">Fontes</AdminTh>
          <AdminTh align="right">Pausadas</AdminTh>
          <AdminTh align="right">403</AdminTh>
          <AdminTh>Último run</AdminTh>
          <AdminTh align="right">Runs 24h</AdminTh>
          <AdminTh align="right">Falhas 24h</AdminTh>
          <AdminTh align="right">Vagas 24h</AdminTh>
          <AdminTh>Próximo run</AdminTh>
        </tr>
      </thead>
      <tbody>
        {data === null ? (
          <tr>
            <AdminTd muted>Carregando…</AdminTd>
          </tr>
        ) : data.adapters.length === 0 ? (
          <tr>
            <AdminTd muted>Nenhum adapter com fontes cadastradas.</AdminTd>
          </tr>
        ) : (
          data.adapters.map((row) => {
            const tone = rowTone(row);
            return (
              <tr
                key={row.adapterType}
                onClick={() =>
                  router.push(`/admin/ingestion?sourceType=${row.adapterType}`)
                }
                style={{ background: TONE_BG[tone], cursor: "pointer" }}
              >
                <AdminTd>
                  <Link
                    href={`/admin/ingestion?sourceType=${row.adapterType}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: AT.ink2,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    {row.adapterType}
                  </Link>
                </AdminTd>
                <AdminTd align="right" mono>
                  {row.totalSources}
                </AdminTd>
                <AdminTd align="right" mono>
                  {row.pausedSources}
                </AdminTd>
                <AdminTd align="right" mono>
                  {row.sourcesWith403}
                </AdminTd>
                <AdminTd mono muted>
                  {formatPast(row.lastRunAt)}
                </AdminTd>
                <AdminTd align="right" mono>
                  {row.runsLast24h}
                </AdminTd>
                <AdminTd align="right" mono>
                  {row.failedRunsLast24h}
                </AdminTd>
                <AdminTd align="right" mono>
                  {row.newJobsLast24h}
                </AdminTd>
                <AdminTd mono muted>
                  {formatFuture(row.nextJobRunAt)}
                </AdminTd>
              </tr>
            );
          })
        )}
      </tbody>
    </AdminTable>
  );
}
