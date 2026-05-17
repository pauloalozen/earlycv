"use client";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export type ScoreState = "anonymous" | "no-cv" | "has-cv";

type Props = {
  scoreState: ScoreState;
  compact?: boolean;
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

export function JobScoreWidget({ scoreState, compact = false }: Props) {
  if (compact) return <CompactDonut scoreState={scoreState} />;
  return <ExpandedScoreWidget scoreState={scoreState} />;
}

// ── 58px donut used in list cards

const DONUT_R = 22;

function CompactDonut({ scoreState }: { scoreState: ScoreState }) {
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
        href="/cv-base"
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

function ExpandedScoreWidget({ scoreState }: { scoreState: ScoreState }) {
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
            href="/cv-base"
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

  // has-cv: placeholder compat card
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
