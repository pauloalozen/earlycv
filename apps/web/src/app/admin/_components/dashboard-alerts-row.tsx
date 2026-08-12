"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AT } from "@/app/admin/_components/admin-primitives";

type Alerts = {
  pausedSources: number;
  sourcesWith403: number;
  driftSources: number;
  failedJobsToday: number;
  indexingRemovalsLast24h: number;
};

type AlertCardConfig = {
  key: keyof Alerts;
  label: string;
  cta: string;
  href: string;
};

const CARDS: AlertCardConfig[] = [
  {
    key: "pausedSources",
    label: "Sources pausadas",
    cta: "circuit breaker →",
    href: "/admin/ingestion?filter=paused",
  },
  {
    key: "sourcesWith403",
    label: "Sources com 403",
    cta: "acumulando →",
    href: "/admin/ingestion?filter=with403",
  },
  {
    key: "driftSources",
    label: "Drift de schema",
    cta: "markup mudou →",
    href: "/admin/ingestion/filter?status=SKIPPED",
  },
  {
    key: "failedJobsToday",
    label: "Falhas hoje",
    cta: "ver logs →",
    href: "/admin/ingestion?tab=runs",
  },
];

export function DashboardAlertsRow() {
  const [data, setData] = useState<Alerts | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard/alerts");
      if (res.ok) setData(await res.json());
    } catch {
      // silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 8,
        }}
      >
        {CARDS.map((card) => {
          const value = data?.[card.key] ?? null;
          const alert = value !== null && value > 0;
          return (
            <Link
              key={card.key}
              href={card.href}
              style={{
                display: "block",
                background: alert ? AT.dangerBg : AT.card,
                border: `1px solid ${alert ? "rgba(155,44,44,0.20)" : AT.border}`,
                borderRadius: 10,
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
                {card.label}
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 500,
                  letterSpacing: -1.2,
                  color: alert ? AT.danger : AT.ink2,
                  lineHeight: 1,
                  marginTop: 8,
                }}
              >
                {value === null ? "—" : value}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: alert ? AT.danger : AT.muted,
                  marginTop: 6,
                  fontWeight: 500,
                }}
              >
                {card.cta}
              </div>
            </Link>
          );
        })}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: AT.muted,
          fontFamily: '"Geist Mono", monospace',
        }}
      >
        {data?.indexingRemovalsLast24h ?? "—"} notificações de remoção
        enviadas ao Google Indexing API (últimas 24h)
      </div>
    </div>
  );
}
