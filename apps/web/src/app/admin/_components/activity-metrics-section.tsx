"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { AT } from "./admin-primitives";
import { Sparkline } from "./sparkline";

type MetricSeries = {
  series: { date: string; count: number }[];
  total: number;
};

type ActivityMetricsResponse = {
  metrics: {
    analyses: MetricSeries;
    applications: MetricSeries;
    cvUnlocks: MetricSeries;
    radarViews: MetricSeries;
  };
};

const CARD_DEFS: {
  key: keyof ActivityMetricsResponse["metrics"];
  label: string;
}[] = [
  { key: "analyses", label: "Análises feitas" },
  { key: "cvUnlocks", label: "CVs liberados" },
  { key: "applications", label: "Candidaturas criadas" },
  { key: "radarViews", label: "Acessos ao radar" },
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

const PRESETS: { days: number; label: string }[] = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

export function ActivityMetricsSection() {
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<ActivityMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/admin/dashboard/activity-metrics?from=${range.from}&to=${range.to}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    setRange({ from: toIsoDate(from), to: toIsoDate(to) });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: '"Geist Mono", monospace',
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: AT.muted2,
            fontWeight: 500,
          }}
        >
          ATIVIDADE · PERÍODO
        </div>
        <DateRangeControls
          onApplyPreset={applyPreset}
          onChange={setRange}
          range={range}
        />
      </div>

      <div
        className="admin-stats-row"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {CARD_DEFS.map((def) => (
          <ActivityStatCard
            key={def.key}
            label={def.label}
            loading={loading}
            metric={data?.metrics[def.key]}
          />
        ))}
      </div>
    </div>
  );
}

function DateRangeControls({
  range,
  onChange,
  onApplyPreset,
}: {
  onApplyPreset: (days: number) => void;
  onChange: (range: { from: string; to: string }) => void;
  range: { from: string; to: string };
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
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
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => onApplyPreset(p.days)}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: '"Geist", sans-serif',
              border: "1px solid transparent",
              cursor: "pointer",
              background: "transparent",
              color: AT.muted,
            }}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          onChange={(e) => onChange({ ...range, from: e.target.value })}
          style={dateInputStyle}
          type="date"
          value={range.from}
        />
        <span style={{ color: AT.faint, fontSize: 12 }}>até</span>
        <input
          onChange={(e) => onChange({ ...range, to: e.target.value })}
          style={dateInputStyle}
          type="date"
          value={range.to}
        />
      </div>
    </div>
  );
}

const dateInputStyle: CSSProperties = {
  fontFamily: '"Geist Mono", monospace',
  fontSize: 12,
  color: AT.ink2,
  background: AT.card,
  border: `1px solid ${AT.border}`,
  borderRadius: 6,
  padding: "5px 8px",
};

function ActivityStatCard({
  label,
  metric,
  loading,
}: {
  label: string;
  loading: boolean;
  metric: MetricSeries | undefined;
}) {
  const points = metric?.series.map((p) => p.count) ?? [];

  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
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
          fontFamily: '"Geist", sans-serif',
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: -1.2,
          color: AT.ink2,
          lineHeight: 1,
        }}
      >
        {loading ? "…" : metric ? metric.total : "—"}
      </div>
      <Sparkline points={points.length > 0 ? points : [0, 0]} width={140} />
    </div>
  );
}
