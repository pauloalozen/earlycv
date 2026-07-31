const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Score semantics: verde >70 · âmbar 40-70 · cinza <40. Cores dedicadas pro
// texto/anel em cima de fundo claro (o lime de marca #c6ff3a não tem
// contraste suficiente como cor de texto/traço em fundo claro) — porta
// direta do design (radar-shared.jsx), que já resolveu esse contraste.
export const SCORE = {
  high: {
    fg: "#1f7a34",
    bg: "rgba(34,163,72,0.14)",
    ring: "#2fa84c",
    label: "alta compatibilidade",
  },
  mid: {
    fg: "#966615",
    bg: "rgba(217,163,34,0.16)",
    ring: "#d9a322",
    label: "compatibilidade média",
  },
  low: {
    fg: "#6a6560",
    bg: "rgba(10,10,10,0.055)",
    ring: "#a0a098",
    label: "baixa compatibilidade",
  },
} as const;

export type ScoreTier = keyof typeof SCORE;

export function scoreTier(value: number): ScoreTier {
  if (value >= 70) return "high";
  if (value >= 40) return "mid";
  return "low";
}

export type MatchBreakdown = {
  area: number;
  skills: number;
  seniority: number;
  technologies: number;
  language: number;
  workModel: number;
};

export type MatchData = {
  score: number;
  breakdown: MatchBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
};

// Pontos máximos por dimensão em MatchingEngine.calculateScore() — os
// valores de `breakdown` vêm em pontos brutos (ex: area até 25), não em
// percentual, então precisam ser normalizados antes de virar largura de
// barra ou cor por faixa.
export const BREAKDOWN_MAX: Record<keyof MatchBreakdown, number> = {
  area: 25,
  skills: 30,
  seniority: 20,
  technologies: 15,
  language: 5,
  workModel: 5,
};

export function breakdownPct(key: keyof MatchBreakdown, value: number): number {
  return Math.round((value / BREAKDOWN_MAX[key]) * 100);
}

// ── Score ring dominante (elemento principal do card) ──
export function ScoreRing({
  value,
  size = 84,
}: {
  value: number;
  size?: number;
}) {
  const t = SCORE[scoreTier(value)];
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (c * value) / 100;
  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg
        aria-hidden
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
      >
        <title>Score ring</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(10,10,10,0.07)"
          strokeWidth="7"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.ring}
          strokeWidth="7"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: size * 0.29,
            fontWeight: 600,
            letterSpacing: -0.8,
            color: "#0a0a0a",
            lineHeight: 1,
            fontFamily: GEIST,
          }}
        >
          {Math.round(value)}
          <span
            style={{ fontSize: size * 0.14, color: "#8a8a85", fontWeight: 500 }}
          >
            %
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Pill verbal colorida ──
export function ScorePill({
  value,
  size = "md",
}: {
  value: number;
  size?: "md" | "lg";
}) {
  const t = SCORE[scoreTier(value)];
  const big = size === "lg";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: t.bg,
        color: t.fg,
        fontWeight: 600,
        fontFamily: MONO,
        letterSpacing: 0.2,
        fontSize: big ? 12.5 : 10.5,
        padding: big ? "5px 11px" : "3px 8px",
        borderRadius: 99,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: t.ring,
          flexShrink: 0,
        }}
      />
      {Math.round(value)}% · {t.label}
    </span>
  );
}

// ── Barra fina de breakdown (inline no card + no detalhe) ──
export function MiniBar({
  label,
  value,
  compact,
}: {
  label: string;
  value: number;
  compact?: boolean;
}) {
  const t = SCORE[scoreTier(value)];
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        <span
          style={{
            fontSize: compact ? 10 : 11.5,
            color: "#6a6560",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: compact ? 9.5 : 11,
            color: t.fg,
            fontWeight: 600,
          }}
        >
          {Math.round(value)}%
        </span>
      </div>
      <div
        style={{
          height: compact ? 4 : 6,
          borderRadius: 99,
          background: "rgba(10,10,10,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: "100%",
            background: t.ring,
            borderRadius: 99,
          }}
        />
      </div>
    </div>
  );
}

// ── Chip de skill: você tem (verde) × falta (cinza) ──
export function SkillChip({ label, have }: { label: string; have: boolean }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: 0.2,
        padding: "4px 9px",
        borderRadius: 5,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: have ? "rgba(34,163,72,0.13)" : "#fff",
        color: have ? "#1f7a34" : "#8a8a85",
        border: have
          ? "1px solid rgba(34,163,72,0.22)"
          : "1px solid rgba(10,10,10,0.1)",
        fontWeight: have ? 600 : 400,
      }}
    >
      {have ? (
        <svg aria-hidden width="9" height="9" viewBox="0 0 24 24" fill="none">
          <title>Você tem</title>
          <path
            d="M5 12l5 5L20 7"
            stroke="#1f7a34"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {label}
    </span>
  );
}

// ── Botão adaptar CV — com score embutido quando disponível ──
export function AdaptBtn({
  href,
  score,
  size = "md",
}: {
  href: string;
  score?: number | null;
  size?: "md" | "lg";
}) {
  const hasScore = typeof score === "number";
  const tier = hasScore ? scoreTier(score) : null;
  const big = size === "lg";
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: "#0a0a0a",
        color: "#fafaf6",
        border: "none",
        borderRadius: 8,
        padding: big ? "13px 18px" : "9px 13px",
        fontSize: big ? 13.5 : 11.5,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: GEIST,
        whiteSpace: "nowrap",
        textDecoration: "none",
        boxShadow:
          hasScore && tier === "high"
            ? "0 0 0 1.5px rgba(47,168,76,0.4), 0 4px 14px rgba(0,0,0,0.14)"
            : "none",
      }}
    >
      <svg
        aria-hidden
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="#c6ff3a"
      >
        <title>Adaptar</title>
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
      adaptar CV
      {hasScore ? (
        <span style={{ opacity: 0.5, fontFamily: MONO }}>
          · {Math.round(score)}%
        </span>
      ) : null}
    </a>
  );
}
