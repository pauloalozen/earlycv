const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Labels de JobArea/SeniorityLevel (enums do Prisma) — usados tanto no
// resumo de calibração do hero de /vagas quanto nos itens do painel de
// breakdown clicável do card (ScoreBreakdownPanel).
export const RADAR_AREA_LABELS: Record<string, string> = {
  DATA_AI: "Dados & IA",
  SOFTWARE_ENGINEERING: "Engenharia de Software",
  CLOUD_DEVOPS: "Cloud & DevOps",
  CYBERSECURITY: "Segurança da Informação",
  PRODUCT: "Produto",
  DESIGN_UX: "Design & UX",
  QA_TEST: "QA & Testes",
  PROJECT_AGILE: "Gestão de Projetos",
  ARCHITECTURE: "Arquitetura",
  LEADERSHIP: "Liderança",
  OTHER: "Geral",
};

export const RADAR_SENIORITY_LABELS: Record<string, string> = {
  INTERN: "estagiário",
  JUNIOR: "júnior",
  MID: "pleno",
  SENIOR: "sênior",
  LEAD: "lead",
  STAFF: "staff",
  MANAGER: "gerente",
  DIRECTOR: "diretor",
  UNKNOWN: "",
};

// Escala vermelho → laranja → amarelo → verde (0-100%), aplicada como cor
// sólida por faixa — a mesma lógica usada nos anéis de score também vale
// pra barras de breakdown. Cores dedicadas pro texto/anel em cima de fundo
// claro (o lime de marca #c6ff3a não tem contraste suficiente como cor de
// texto/traço em fundo claro) — porta direta do design (radar-shared.jsx).
export const SCORE = {
  high: {
    fg: "#1f7a34",
    bg: "rgba(34,163,72,0.14)",
    ring: "#2fa84c",
    label: "alta oportunidade",
  },
  mid: {
    fg: "#966615",
    bg: "rgba(217,163,34,0.16)",
    ring: "#d9a322",
    label: "oportunidade média",
  },
  low: {
    fg: "#c2410c",
    bg: "rgba(249,115,22,0.14)",
    ring: "#f97316",
    label: "oportunidade baixa",
  },
  critical: {
    fg: "#b91c1c",
    bg: "rgba(239,68,68,0.14)",
    ring: "#ef4444",
    label: "oportunidade muito baixa",
  },
} as const;

// Mesmas faixas, cores com contraste pensado pra cima de fundo escuro
// (#0a0a0a) — usado no card de compatibilidade do detalhe da vaga, que é
// preto no design de referência.
export const SCORE_DARK = {
  high: { fg: "#4ade80", label: "alta oportunidade" },
  mid: { fg: "#fbbf24", label: "oportunidade média" },
  low: { fg: "#fb923c", label: "oportunidade baixa" },
  critical: { fg: "#f87171", label: "oportunidade muito baixa" },
} as const;

export type ScoreTier = keyof typeof SCORE;

export function scoreTier(value: number): ScoreTier {
  if (value >= 70) return "high";
  if (value >= 45) return "mid";
  if (value >= 25) return "low";
  return "critical";
}

export function scoreColor(value: number): string {
  return SCORE[scoreTier(value)].ring;
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
  dark = false,
}: {
  value: number;
  size?: number;
  dark?: boolean;
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
          stroke={dark ? "rgba(250,250,246,0.1)" : "rgba(10,10,10,0.07)"}
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
            color: dark ? "#fafaf6" : "#0a0a0a",
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
  format = "score-first",
}: {
  value: number;
  size?: "md" | "lg";
  format?: "score-first" | "label-first" | "label-only";
}) {
  const t = SCORE[scoreTier(value)];
  const dt = SCORE_DARK[scoreTier(value)];
  const big = size === "lg";
  const baseFontSize = big ? 12.5 : 10.5;

  // Sem número: usado ao lado de um ScoreRing que já mostra o percentual —
  // duplicar o número no badge é redundante, só o texto categórico importa
  // aqui. Cores pensadas pra fundo escuro (card preto do detalhe da vaga).
  if (format === "label-only") {
    return (
      <span
        style={{
          fontFamily: MONO,
          fontSize: big ? 12.5 : 11,
          fontWeight: 600,
          letterSpacing: 0.3,
          color: dt.fg,
        }}
      >
        {dt.label}
      </span>
    );
  }

  if (format === "label-first") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 1,
          lineHeight: 1,
          background: "#fff",
          border: `1.5px solid ${t.ring}`,
          borderRadius: 8,
          padding: "5px 9px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 8.5,
            letterSpacing: 0.3,
            fontWeight: 600,
            color: t.fg,
          }}
        >
          score
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
            color: t.fg,
          }}
        >
          {Math.round(value)}%
        </span>
      </div>
    );
  }

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
        fontSize: baseFontSize,
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
      {`${Math.round(value)}% · ${t.label}`}
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
export function SkillChip({
  label,
  have,
  dark = false,
}: {
  label: string;
  have: boolean;
  dark?: boolean;
}) {
  const haveFg = dark ? "#4ade80" : "#1f7a34";
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
        background: have
          ? "rgba(34,163,72,0.13)"
          : dark
            ? "rgba(250,250,246,0.06)"
            : "#fff",
        color: have ? haveFg : dark ? "rgba(250,250,246,0.5)" : "#8a8a85",
        border: have
          ? "1px solid rgba(34,163,72,0.3)"
          : dark
            ? "1px solid rgba(250,250,246,0.12)"
            : "1px solid rgba(10,10,10,0.1)",
        fontWeight: have ? 600 : 400,
      }}
    >
      {have ? (
        <svg aria-hidden width="9" height="9" viewBox="0 0 24 24" fill="none">
          <title>Você tem</title>
          <path
            d="M5 12l5 5L20 7"
            stroke={haveFg}
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

// ── Botão "Analisar meu CV" — com score embutido quando disponível.
// variant="view" cobre o caso em que já existe candidatura+análise pra essa
// vaga: o CTA vira "Ver candidatura" apontando pro histórico já calculado,
// em vez de convidar a analisar de novo. ──
export function AdaptBtn({
  href,
  score,
  size = "md",
  fullWidth = false,
  variant = "analyze",
}: {
  href: string;
  score?: number | null;
  size?: "md" | "lg";
  fullWidth?: boolean;
  variant?: "analyze" | "view";
}) {
  const hasScore = typeof score === "number";
  const tier = hasScore ? scoreTier(score) : null;
  const big = size === "lg";
  const isView = variant === "view";
  return (
    <a
      href={href}
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: fullWidth ? "100%" : undefined,
        boxSizing: "border-box",
        background: isView ? "#c6ff3a" : "#0a0a0a",
        color: isView ? "#25330a" : "#fafaf6",
        border: "none",
        borderRadius: 8,
        padding: big ? "13px 18px" : "9px 13px",
        fontSize: big ? 13.5 : 11.5,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: GEIST,
        whiteSpace: "nowrap",
        textDecoration: "none",
        boxShadow: isView
          ? "0 4px 14px rgba(198,255,58,0.35)"
          : hasScore && tier === "high"
            ? "0 0 0 1.5px rgba(47,168,76,0.4), 0 4px 14px rgba(0,0,0,0.14)"
            : "none",
      }}
    >
      {isView ? (
        <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none">
          <title>Ver candidatura</title>
          <path
            d="M5 12l5 5L20 7"
            stroke="#25330a"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
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
      )}
      {isView ? "Ver candidatura" : "Analisar meu CV"}
    </a>
  );
}
