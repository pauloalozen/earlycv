"use client";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export type ScoreState = "anonymous" | "no-cv" | "has-cv";

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

type Props = {
  scoreState: ScoreState;
  compact?: boolean;
  match?: MatchData | null;
};

// ✅ verde > 70%, ⚠️ amarelo 40-70%, cinza < 40%
function scoreTier(score: number): "high" | "mid" | "low" {
  if (score > 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

const TIER_COLORS: Record<
  "high" | "mid" | "low",
  { fg: string; label: string }
> = {
  high: { fg: "#c6ff3a", label: "alta compatibilidade" },
  mid: { fg: "#eab308", label: "compatibilidade média" },
  low: { fg: "#8a8a85", label: "compatibilidade baixa" },
};

function LockIcon() {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Cadeado</title>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function JobScoreWidget({ scoreState, compact = false, match }: Props) {
  if (compact) return <CompactDonut scoreState={scoreState} match={match} />;
  return <ExpandedScoreWidget scoreState={scoreState} match={match} />;
}

// ── 58px donut used in list cards

const DONUT_R = 22;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_R;

function CompactDonut({
  scoreState,
  match,
}: {
  scoreState: ScoreState;
  match?: MatchData | null;
}) {
  if (scoreState === "has-cv" && match) {
    const tier = scoreTier(match.score);
    const color = TIER_COLORS[tier].fg;
    const offset =
      DONUT_CIRCUMFERENCE - (match.score / 100) * DONUT_CIRCUMFERENCE;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 58,
            height: 58,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            aria-hidden
            width="58"
            height="58"
            viewBox="0 0 58 58"
            style={{
              position: "absolute",
              inset: 0,
              transform: "rotate(-90deg)",
            }}
          >
            <title>Score ring</title>
            <circle
              cx="29"
              cy="29"
              r={DONUT_R}
              fill="none"
              stroke="rgba(10,10,10,0.08)"
              strokeWidth="4"
            />
            <circle
              cx="29"
              cy="29"
              r={DONUT_R}
              fill="none"
              stroke={color}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={DONUT_CIRCUMFERENCE}
              strokeDashoffset={offset}
            />
          </svg>
          <span
            style={{
              position: "relative",
              zIndex: 1,
              fontFamily: MONO,
              fontSize: 13,
              fontWeight: 600,
              color: "#0a0a0a",
            }}
          >
            {Math.round(match.score)}%
          </span>
        </div>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: 0.5,
            color: "#8a8a85",
            marginTop: 5,
          }}
        >
          compat.
        </span>
      </div>
    );
  }

  const ring = (
    <svg
      aria-hidden
      width="58"
      height="58"
      viewBox="0 0 58 58"
      style={{ position: "absolute", inset: 0 }}
    >
      <title>Score ring</title>
      <circle
        cx="29"
        cy="29"
        r={DONUT_R}
        fill="none"
        stroke="rgba(10,10,10,0.08)"
        strokeWidth="4"
      />
    </svg>
  );

  const circleStyle = {
    position: "relative" as const,
    width: 58,
    height: 58,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const labelStyle = {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 0.5,
    color: "#8a8a85",
    marginTop: 5,
  };

  if (scoreState === "anonymous") {
    return (
      <a
        href="/entrar?tab=cadastrar"
        title="Cadastre-se para ver compatibilidade"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
          textDecoration: "none",
        }}
      >
        <div style={circleStyle}>
          {ring}
          <span
            style={{
              position: "relative",
              zIndex: 1,
              color: "#8a8a85",
              display: "flex",
            }}
          >
            <LockIcon />
          </span>
        </div>
        <span style={labelStyle}>entrar</span>
      </a>
    );
  }

  if (scoreState === "no-cv") {
    return (
      <a
        href="/meu-cv-master"
        title="Suba seu CV para ver compatibilidade"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
          textDecoration: "none",
        }}
      >
        <div style={circleStyle}>
          {ring}
          <span
            style={{
              position: "relative",
              zIndex: 1,
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: 0.5,
              color: "#8a8a85",
            }}
          >
            CV
          </span>
        </div>
        <span style={labelStyle}>enviar cv</span>
      </a>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <div style={circleStyle}>
        {ring}
        <span
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: MONO,
            fontSize: 12,
            color: "#8a8a85",
          }}
        >
          —
        </span>
      </div>
      <span style={labelStyle}>breve</span>
    </div>
  );
}

// ── Black expanded compat widget used in detail sidebar

function CompatHead() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.4,
          color: "#8a8a85",
          fontWeight: 500,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#c6ff3a",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        COMPATIBILIDADE
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: "#5a5a54",
          letterSpacing: 0.3,
        }}
      >
        vs. seu CV
      </span>
    </div>
  );
}

function PlaceholderDial() {
  return (
    <svg aria-hidden width="76" height="76" viewBox="0 0 76 76">
      <title>Score dial</title>
      <circle
        cx="38"
        cy="38"
        r="30"
        stroke="rgba(250,250,246,0.08)"
        strokeWidth="5"
        fill="none"
      />
    </svg>
  );
}

function ExpandedScoreWidget({
  scoreState,
  match,
}: {
  scoreState: ScoreState;
  match?: MatchData | null;
}) {
  if (scoreState === "anonymous") {
    return (
      <div
        style={{
          background: "#0a0a0a",
          borderRadius: 14,
          padding: "22px 22px 20px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            filter: "blur(5px)",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          <CompatHead />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              paddingBottom: 18,
              borderBottom: "1px solid rgba(250,250,246,0.08)",
            }}
          >
            <PlaceholderDial />
            <div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 500,
                  letterSpacing: -1.4,
                  color: "#fafaf6",
                  display: "flex",
                  alignItems: "baseline",
                }}
              >
                82
                <span
                  style={{
                    fontSize: 14,
                    color: "#8a8a85",
                    marginLeft: 2,
                    fontWeight: 500,
                  }}
                >
                  %
                </span>
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#c6ff3a",
                  letterSpacing: 0.3,
                }}
              >
                alta compatibilidade
              </div>
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
            gap: 8,
            background: "rgba(10,10,10,0.75)",
            backdropFilter: "blur(2px)",
          }}
        >
          <a
            href="/entrar?tab=cadastrar"
            style={{
              background: "#fafaf6",
              color: "#0a0a0a",
              borderRadius: 9,
              padding: "11px 16px",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              display: "block",
              width: "100%",
              fontFamily: GEIST,
              boxSizing: "border-box",
            }}
          >
            Cadastre-se grátis para ver seu score
          </a>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: "#8a8a85",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            análise gratuita · CV adaptado a partir de R$ 11,90
          </p>
        </div>
      </div>
    );
  }

  if (scoreState === "no-cv") {
    return (
      <div
        style={{
          background: "#0a0a0a",
          borderRadius: 14,
          padding: "22px 22px 20px",
          color: "#fafaf6",
          fontFamily: GEIST,
        }}
      >
        <CompatHead />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "8px 0 4px",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(250,250,246,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
              color: "rgba(250,250,246,0.3)",
            }}
          >
            <LockIcon />
          </div>
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              color: "#fafaf6",
              margin: "0 0 6px",
            }}
          >
            Suba seu CV para ver compatibilidade
          </p>
          <p style={{ fontSize: 12, color: "#8a8a85", margin: "0 0 16px" }}>
            O score é calculado com base no seu CV Master.
          </p>
          <a
            href="/meu-cv-master"
            style={{
              background: "#fafaf6",
              color: "#0a0a0a",
              borderRadius: 9,
              padding: "11px 16px",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              display: "block",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            Cadastrar CV →
          </a>
        </div>
      </div>
    );
  }

  if (match) {
    return <RealCompatCard match={match} />;
  }

  // has-cv mas ainda sem score (perfil do Radar não existe ou ainda vazio)
  return (
    <div
      style={{
        background: "#0a0a0a",
        borderRadius: 14,
        padding: "22px 22px 20px",
        color: "#fafaf6",
      }}
    >
      <CompatHead />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 20,
          paddingBottom: 18,
          borderBottom: "1px solid rgba(250,250,246,0.08)",
        }}
      >
        <PlaceholderDial />
        <div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: -1.4,
              color: "#fafaf6",
              lineHeight: 1,
            }}
          >
            —
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: "#8a8a85",
              letterSpacing: 0.3,
              marginTop: 4,
            }}
          >
            Cálculo em breve
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {["Stack técnico", "Senioridade", "Domínio", "Idiomas"].map((k) => (
          <div
            key={k}
            style={{ display: "flex", flexDirection: "column", gap: 5 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#a0a098" }}>{k}</span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#5a5a54",
                  fontWeight: 500,
                }}
              >
                —
              </span>
            </div>
            <div
              style={{
                height: 4,
                background: "rgba(250,250,246,0.08)",
                borderRadius: 99,
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          paddingTop: 14,
          borderTop: "1px solid rgba(250,250,246,0.08)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 0.4,
              color: "#a0a098",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ color: "#405410" }}>✓</span> pontos fortes
          </div>
          <p style={{ fontSize: 11.5, color: "#5a5a54", margin: 0 }}>
            Disponível após análise
          </p>
        </div>
        <div style={{ width: 1, background: "rgba(250,250,246,0.06)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 0.4,
              color: "#a0a098",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ color: "#a8780a" }}>!</span> lacunas
          </div>
          <p style={{ fontSize: 11.5, color: "#5a5a54", margin: 0 }}>
            Disponível após análise
          </p>
        </div>
      </div>
    </div>
  );
}

const BREAKDOWN_ROWS: Array<{
  key: keyof MatchBreakdown;
  label: string;
  max: number;
}> = [
  { key: "area", label: "Área", max: 25 },
  { key: "skills", label: "Skills", max: 30 },
  { key: "seniority", label: "Senioridade", max: 20 },
  { key: "technologies", label: "Tecnologias", max: 15 },
  { key: "language", label: "Idioma", max: 5 },
  { key: "workModel", label: "Modelo de trabalho", max: 5 },
];

function RealCompatCard({ match }: { match: MatchData }) {
  const tier = scoreTier(match.score);
  const { fg, label } = TIER_COLORS[tier];
  const dialCircumference = 2 * Math.PI * 30;
  const dialOffset =
    dialCircumference - (match.score / 100) * dialCircumference;

  return (
    <div
      style={{
        background: "#0a0a0a",
        borderRadius: 14,
        padding: "22px 22px 20px",
        color: "#fafaf6",
      }}
    >
      <CompatHead />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 20,
          paddingBottom: 18,
          borderBottom: "1px solid rgba(250,250,246,0.08)",
        }}
      >
        <svg
          aria-hidden
          width="76"
          height="76"
          viewBox="0 0 76 76"
          style={{ transform: "rotate(-90deg)" }}
        >
          <title>Score dial</title>
          <circle
            cx="38"
            cy="38"
            r="30"
            stroke="rgba(250,250,246,0.08)"
            strokeWidth="5"
            fill="none"
          />
          <circle
            cx="38"
            cy="38"
            r="30"
            stroke={fg}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={dialCircumference}
            strokeDashoffset={dialOffset}
          />
        </svg>
        <div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: -1.4,
              color: "#fafaf6",
              display: "flex",
              alignItems: "baseline",
              lineHeight: 1,
            }}
          >
            {Math.round(match.score)}
            <span
              style={{
                fontSize: 14,
                color: "#8a8a85",
                marginLeft: 2,
                fontWeight: 500,
              }}
            >
              %
            </span>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: fg,
              letterSpacing: 0.3,
              marginTop: 4,
            }}
          >
            {label}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {BREAKDOWN_ROWS.map((row) => {
          const value = match.breakdown[row.key];
          const pct = Math.round((value / row.max) * 100);
          return (
            <div
              key={row.key}
              style={{ display: "flex", flexDirection: "column", gap: 5 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#a0a098" }}>
                  {row.label}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: "#c8c6bf",
                    fontWeight: 500,
                  }}
                >
                  {pct}%
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  background: "rgba(250,250,246,0.08)",
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: fg,
                    borderRadius: 99,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          paddingTop: 14,
          borderTop: "1px solid rgba(250,250,246,0.08)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 0.4,
              color: "#a0a098",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ color: "#405410" }}>✓</span> pontos fortes
          </div>
          {match.matchedSkills.length > 0 ? (
            <p style={{ fontSize: 11.5, color: "#c8c6bf", margin: 0 }}>
              {match.matchedSkills.slice(0, 6).join(", ")}
            </p>
          ) : (
            <p style={{ fontSize: 11.5, color: "#5a5a54", margin: 0 }}>
              Nenhuma skill em comum identificada
            </p>
          )}
        </div>
        <div style={{ width: 1, background: "rgba(250,250,246,0.06)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 0.4,
              color: "#a0a098",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ color: "#a8780a" }}>!</span> lacunas
          </div>
          {match.missingSkills.length > 0 ? (
            <p style={{ fontSize: 11.5, color: "#c8c6bf", margin: 0 }}>
              {match.missingSkills.slice(0, 6).join(", ")}
            </p>
          ) : (
            <p style={{ fontSize: 11.5, color: "#5a5a54", margin: 0 }}>
              Nenhuma lacuna identificada
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
