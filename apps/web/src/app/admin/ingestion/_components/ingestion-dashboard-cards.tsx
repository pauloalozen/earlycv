"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminPill,
  AdminStatsRow,
  AT,
} from "@/app/admin/_components/admin-primitives";

type PausedSource = {
  id: string;
  sourceName: string;
  companyName: string;
  pausedUntil: string;
  pauseReason: string | null;
  consecutive403Count: number;
};

type Source403 = {
  id: string;
  sourceName: string;
  companyName: string;
  consecutive403Count: number;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

type DriftSource = {
  id: string;
  sourceName: string;
  companyName: string;
  total: number;
  withoutDesc: number;
  pctWithoutDesc: number;
};

type Dashboard = {
  pausedSources: PausedSource[];
  sources403: Source403[];
  driftSources: DriftSource[];
  summary24h: {
    totalRuns: number;
    runningNow: number;
    newJobs: number;
    staleJobs: number;
    dedupSkipped: number;
  };
};

function ExpandList({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 11,
          color: AT.info,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontFamily: '"Geist Mono", monospace',
        }}
        type="button"
      >
        {open ? "▾ fechar" : `▸ ${title}`}
      </button>
      {open && (
        <div
          style={{
            marginTop: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function SourceRow({ label, sub }: { label: string; sub?: string }) {
  return (
    <div
      style={{
        background: AT.bgAlt,
        borderRadius: 6,
        padding: "5px 8px",
        fontSize: 11.5,
        color: AT.ink2,
        fontFamily: '"Geist", sans-serif',
      }}
    >
      <div>{label}</div>
      {sub && (
        <div style={{ fontSize: 10.5, color: AT.muted, marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function IngestionDashboardCards() {
  const [data, setData] = useState<Dashboard | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ingestion/dashboard");
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

  const pausedCount = data?.pausedSources.length ?? 0;
  const count403 = data?.sources403.length ?? 0;
  const driftCount = data?.driftSources.length ?? 0;
  const s = data?.summary24h;

  return (
    <div style={{ marginBottom: 20 }}>
      <AdminStatsRow cols={4}>
        {/* Card 1 — Paused */}
        <div
          style={{
            background: pausedCount > 0 ? "#fef2f2" : AT.card,
            border: `1px solid ${pausedCount > 0 ? "rgba(239,68,68,0.25)" : AT.border}`,
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
            Sources pausadas
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: -1.2,
              color: pausedCount > 0 ? "#b91c1c" : AT.ink2,
              lineHeight: 1,
              marginTop: 8,
            }}
          >
            {data === null ? "—" : pausedCount}
          </div>
          {pausedCount > 0 && data && (
            <ExpandList title={`ver ${pausedCount}`}>
              {data.pausedSources.map((s) => (
                <SourceRow
                  key={s.id}
                  label={`${s.companyName} · ${s.sourceName}`}
                  sub={`pausado até ${new Date(s.pausedUntil).toLocaleString("pt-BR")} · ${s.pauseReason ?? ""} · 403s: ${s.consecutive403Count}`}
                />
              ))}
            </ExpandList>
          )}
        </div>

        {/* Card 2 — 403 */}
        <div
          style={{
            background: count403 > 0 ? "#fff7ed" : AT.card,
            border: `1px solid ${count403 > 0 ? "rgba(234,88,12,0.25)" : AT.border}`,
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
            Sources com 403
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: -1.2,
              color: count403 > 0 ? "#c2410c" : AT.ink2,
              lineHeight: 1,
              marginTop: 8,
            }}
          >
            {data === null ? "—" : count403}
          </div>
          {count403 > 0 && data && (
            <ExpandList title={`ver ${count403}`}>
              {data.sources403.map((s) => (
                <SourceRow
                  key={s.id}
                  label={`${s.companyName} · ${s.sourceName}`}
                  sub={`${s.consecutive403Count} 403(s) acumulados · ${s.lastErrorAt ? new Date(s.lastErrorAt).toLocaleString("pt-BR") : "—"}`}
                />
              ))}
            </ExpandList>
          )}
        </div>

        {/* Card 3 — Drift */}
        <div
          style={{
            background: driftCount > 0 ? "#fefce8" : AT.card,
            border: `1px solid ${driftCount > 0 ? "rgba(161,98,7,0.25)" : AT.border}`,
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
            Sources com drift
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: -1.2,
              color: driftCount > 0 ? "#a16207" : AT.ink2,
              lineHeight: 1,
              marginTop: 8,
            }}
          >
            {data === null ? "—" : driftCount}
          </div>
          {driftCount > 0 && data && (
            <ExpandList title={`ver ${driftCount}`}>
              {data.driftSources.map((d) => (
                <SourceRow
                  key={d.id}
                  label={`${d.companyName} · ${d.sourceName}`}
                  sub={`${d.total} vagas · ${d.withoutDesc} sem desc · ${d.pctWithoutDesc}%`}
                />
              ))}
            </ExpandList>
          )}
        </div>

        {/* Card 4 — Últimas 24h */}
        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
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
            Últimas 24h
          </div>
          {!s ? (
            <div style={{ fontSize: 13, color: AT.muted, marginTop: 8 }}>
              Carregando...
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginTop: 10,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <AdminPill tone={s.runningNow > 0 ? "warn" : "neutral"} mono>
                  {s.runningNow} rodando agora
                </AdminPill>
              </div>
              <div style={{ fontSize: 12, color: AT.ink2 }}>
                {s.totalRuns} runs · {s.newJobs} novas · {s.staleJobs} inativas
                · {s.dedupSkipped} dedup
              </div>
            </div>
          )}
        </div>
      </AdminStatsRow>
    </div>
  );
}
