import type { ReactNode } from "react";

// ─── Design tokens ───────────────────────────────────────────────
export const AT = {
  bg: "#f0eee9",
  bgAlt: "#ebe9e3",
  card: "#fafaf6",
  border: "rgba(10,10,10,0.08)",
  borderSoft: "rgba(10,10,10,0.05)",
  ink: "#0a0a0a",
  ink2: "#2a2620",
  muted: "#6a6560",
  muted2: "#8a8580",
  faint: "#a8a39d",
  ok: "#1f7a4d",
  okBg: "#e1efe5",
  warn: "#8a6014",
  warnBg: "#f5ead0",
  danger: "#9b2c2c",
  dangerBg: "#f5dada",
  info: "#2e5a8a",
  infoBg: "#dfe8f3",
  neutralBg: "#ebe9e3",
};

// ─── AdminStatCard ────────────────────────────────────────────────
type AdminStatCardProps = {
  delta?: string;
  label: string;
  sub?: string;
  value: string;
};

export function AdminStatCard({
  label,
  value,
  delta,
  sub,
}: AdminStatCardProps) {
  const deltaPositive = delta?.startsWith("+");
  const deltaNegative = delta?.startsWith("-");
  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "16px 18px",
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
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
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginTop: 8,
        }}
      >
        <div
          style={{
            fontFamily: '"Geist", sans-serif',
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: -1.2,
            color: AT.ink2,
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        {delta && (
          <div
            style={{
              fontFamily: '"Geist Mono", monospace',
              fontSize: 11,
              fontWeight: 500,
              color: deltaPositive
                ? AT.ok
                : deltaNegative
                  ? AT.danger
                  : AT.muted2,
            }}
          >
            {delta}
          </div>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: AT.muted, marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── AdminPill ────────────────────────────────────────────────────
type PillTone = "neutral" | "ok" | "warn" | "danger" | "info" | "dark";

type AdminPillProps = {
  children: ReactNode;
  mono?: boolean;
  tone?: PillTone;
};

export function AdminPill({
  tone = "neutral",
  children,
  mono = false,
}: AdminPillProps) {
  const tones: Record<PillTone, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: AT.neutralBg, fg: AT.ink2, bd: AT.border },
    ok: { bg: AT.okBg, fg: AT.ok, bd: "rgba(31,122,77,0.18)" },
    warn: { bg: AT.warnBg, fg: AT.warn, bd: "rgba(138,96,20,0.20)" },
    danger: { bg: AT.dangerBg, fg: AT.danger, bd: "rgba(155,44,44,0.20)" },
    info: { bg: AT.infoBg, fg: AT.info, bd: "rgba(46,90,138,0.20)" },
    dark: { bg: AT.ink, fg: AT.card, bd: AT.ink },
  };
  const c = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
        borderRadius: 4,
        padding: "2px 7px",
        fontSize: 10,
        fontFamily: mono ? '"Geist Mono", monospace' : '"Geist", sans-serif',
        fontWeight: 500,
        letterSpacing: mono ? 0.3 : 0,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ─── AdminTable ───────────────────────────────────────────────────
type AdminTableProps = { children: ReactNode };

export function AdminTable({ children }: AdminTableProps) {
  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        overflowX: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
        {children}
      </table>
    </div>
  );
}

type AdminThProps = {
  align?: "left" | "right" | "center";
  children: ReactNode;
  w?: number | string;
};

export function AdminTh({ children, w, align = "left" }: AdminThProps) {
  return (
    <th
      style={{
        fontFamily: '"Geist Mono", monospace',
        fontSize: 10,
        letterSpacing: 1.1,
        color: AT.muted2,
        fontWeight: 500,
        textTransform: "uppercase",
        textAlign: align,
        padding: "11px 16px",
        width: w,
        borderBottom: `1px solid ${AT.border}`,
        background: "#f4f2ec",
      }}
    >
      {children}
    </th>
  );
}

type AdminTdProps = {
  align?: "left" | "right" | "center";
  children: ReactNode;
  mono?: boolean;
  muted?: boolean;
  w?: number | string;
};

export function AdminTd({
  children,
  align = "left",
  mono = false,
  muted = false,
  w,
}: AdminTdProps) {
  return (
    <td
      style={{
        fontFamily: mono ? '"Geist Mono", monospace' : '"Geist", sans-serif',
        fontSize: mono ? 11.5 : 13,
        color: muted ? AT.muted : AT.ink2,
        padding: "12px 16px",
        borderBottom: `1px solid ${AT.borderSoft}`,
        textAlign: align,
        verticalAlign: "middle",
        width: w,
      }}
    >
      {children}
    </td>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────
type AdminPageWrapProps = { children: ReactNode; maxWidth?: number };

export function AdminPageWrap({
  children,
  maxWidth = 1440,
}: AdminPageWrapProps) {
  return (
    <div
      className="admin-page-wrap"
      style={{
        padding: "0 32px 40px",
        maxWidth,
        margin: "0 auto",
      }}
    >
      <style>{`
        @media (max-width: 639px) {
          .admin-page-wrap { padding: 0 14px 40px !important; }
          .admin-stats-row { grid-template-columns: repeat(2, 1fr) !important; }
          .admin-shell-header { flex-direction: column !important; gap: 16px !important; padding: 16px 0 14px !important; }
          .admin-shell-header-actions { padding-top: 0 !important; }
        }
      `}</style>
      {children}
    </div>
  );
}

// ─── Stats row helper ─────────────────────────────────────────────
type AdminStatsRowProps = { children: ReactNode; cols?: number };

export function AdminStatsRow({ children, cols = 4 }: AdminStatsRowProps) {
  return (
    <div
      className="admin-stats-row"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 10,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}

// ─── Filter bar wrapper ───────────────────────────────────────────
type AdminFilterBarProps = { children: ReactNode };

export function AdminFilterBar({ children }: AdminFilterBarProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 14,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {children}
    </div>
  );
}

// ─── Pagination row ───────────────────────────────────────────────
type AdminPaginationProps = {
  children: ReactNode;
  summary: string;
};

export function AdminPagination({ summary, children }: AdminPaginationProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 12,
        fontSize: 12,
        color: AT.muted,
        fontFamily: '"Geist Mono", monospace',
      }}
    >
      <span>{summary}</span>
      <div style={{ display: "flex", gap: 6 }}>{children}</div>
    </div>
  );
}
