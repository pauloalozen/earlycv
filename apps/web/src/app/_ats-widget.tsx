"use client";

import { useEffect, useRef, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";

type Keyword = { word: string; threshold: number };

type Preset = {
  cargo: string;
  scoreStart: number;
  scoreEnd: number;
  keywords: Keyword[];
};

const PRESETS: Preset[] = [
  {
    cargo: "SENIOR DEV",
    scoreStart: 34,
    scoreEnd: 92,
    keywords: [
      { word: "React", threshold: 0 },
      { word: "TypeScript", threshold: 0 },
      { word: "Node.js", threshold: 0 },
      { word: "AWS", threshold: 60 },
      { word: "CI/CD", threshold: 70 },
      { word: "GraphQL", threshold: 80 },
    ],
  },
  {
    cargo: "DATA ANALYST",
    scoreStart: 41,
    scoreEnd: 88,
    keywords: [
      { word: "Python", threshold: 0 },
      { word: "SQL", threshold: 0 },
      { word: "Excel", threshold: 0 },
      { word: "Tableau", threshold: 55 },
      { word: "Power BI", threshold: 68 },
      { word: "dbt", threshold: 78 },
    ],
  },
  {
    cargo: "PRODUCT MANAGER",
    scoreStart: 29,
    scoreEnd: 85,
    keywords: [
      { word: "Agile", threshold: 0 },
      { word: "Roadmap", threshold: 0 },
      { word: "OKRs", threshold: 50 },
      { word: "A/B Test", threshold: 63 },
      { word: "SQL", threshold: 72 },
      { word: "Figma", threshold: 79 },
    ],
  },
  {
    cargo: "UX DESIGNER",
    scoreStart: 45,
    scoreEnd: 91,
    keywords: [
      { word: "Figma", threshold: 0 },
      { word: "Protótipo", threshold: 0 },
      { word: "Pesquisa", threshold: 0 },
      { word: "Design System", threshold: 58 },
      { word: "Acessib.", threshold: 72 },
      { word: "Usabilidade", threshold: 82 },
    ],
  },
  {
    cargo: "MARKETING",
    scoreStart: 38,
    scoreEnd: 90,
    keywords: [
      { word: "SEO", threshold: 0 },
      { word: "Google Ads", threshold: 0 },
      { word: "Analytics", threshold: 0 },
      { word: "CRM", threshold: 57 },
      { word: "Copywriting", threshold: 69 },
      { word: "HubSpot", threshold: 81 },
    ],
  },
];

const COUNT_DUR = 2800;
const PAUSE_DUR = 1400;
const FADE_DUR = 320;

export function AtsWidget() {
  const [presetIdx, setPresetIdx] = useState(0);
  const [score, setScore] = useState(PRESETS[0].scoreStart);
  const [opacity, setOpacity] = useState(1);

  const phaseRef = useRef<"counting" | "pausing" | "fading">("counting");
  const frameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const presetIdxRef = useRef(0);

  useEffect(() => {
    function startCounting(now: number) {
      phaseRef.current = "counting";
      startTimeRef.current = now;
      const preset = PRESETS[presetIdxRef.current];
      setScore(preset.scoreStart);

      function tick(ts: number) {
        const t = ts - startTimeRef.current;
        const preset = PRESETS[presetIdxRef.current];

        if (phaseRef.current === "counting") {
          if (t < COUNT_DUR) {
            const p = t / COUNT_DUR;
            const eased = 1 - Math.pow(1 - p, 3);
            setScore(Math.round(preset.scoreStart + (preset.scoreEnd - preset.scoreStart) * eased));
            frameRef.current = requestAnimationFrame(tick);
          } else {
            setScore(preset.scoreEnd);
            phaseRef.current = "pausing";
            timerRef.current = setTimeout(() => {
              // fade out
              phaseRef.current = "fading";
              setOpacity(0);
              timerRef.current = setTimeout(() => {
                // switch preset
                const next = (presetIdxRef.current + 1) % PRESETS.length;
                presetIdxRef.current = next;
                setPresetIdx(next);
                setScore(PRESETS[next].scoreStart);
                // fade in
                setOpacity(1);
                frameRef.current = requestAnimationFrame((ts2) => startCounting(ts2));
              }, FADE_DUR);
            }, PAUSE_DUR);
          }
        }
      }

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(startCounting);

    return () => {
      cancelAnimationFrame(frameRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const preset = PRESETS[presetIdx];
  const isGreen = score >= 80;
  const strokeColor = isGreen ? "#c6ff3a" : "#f5c518";
  const R = 72;
  const C = 2 * Math.PI * R;
  const dash = C * (score / 100);
  const pct = score / 100;

  return (
    <div
      style={{
        width: 440,
        maxWidth: "100%",
        background: "#fafaf6",
        borderRadius: 14,
        border: "1px solid rgba(10,10,10,0.08)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(10,10,10,0.18)",
        overflow: "hidden",
        fontFamily: "var(--font-geist), -apple-system, sans-serif",
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "11px 14px",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
          background: "#f0efe9",
          position: "relative",
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57", display: "inline-block" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e", display: "inline-block" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840", display: "inline-block" }} />
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 11,
            color: "#7a7a74",
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          cv-analysis.earlyCV
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          padding: "22px 26px 26px",
          opacity,
          transition: `opacity ${FADE_DUR}ms ease`,
        }}
      >
        {/* Live label */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1,
            color: "#555",
            marginBottom: 14,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isGreen ? "#c6ff3a" : "#f5c518",
              display: "inline-block",
              animation: "lp-pulse 1.4s infinite",
            }}
          />
          ANALISANDO CV PARA VAGA · {preset.cargo}
        </div>

        {/* Gauge */}
        <div style={{ position: "relative", width: 180, height: 180, margin: "0 auto 20px" }}>
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
          <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden>
            <circle cx="90" cy="90" r={R} stroke="#1a1a1a" strokeWidth="10" fill="none" />
            <circle
              cx="90" cy="90" r={R}
              stroke={strokeColor}
              strokeWidth="10"
              fill="none"
              strokeDasharray={`${dash} ${C}`}
              strokeDashoffset={0}
              transform="rotate(-90 90 90)"
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 80ms linear, stroke 300ms" }}
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
            <span
              style={{
                fontSize: 54,
                fontWeight: 500,
                letterSpacing: -2.5,
                lineHeight: 1,
                color: "#0a0a0a",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {score}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: "#7a7a74", marginTop: 4 }}>
              ATS SCORE
            </span>
          </div>
        </div>

        {/* Keywords */}
        <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.8, color: "#7a7a74", marginBottom: 10, fontWeight: 500 }}>
          Palavras-chave detectadas
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 18 }}>
          {preset.keywords.map((k) => {
            const hit = score >= k.threshold;
            return (
              <div
                key={k.word}
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "6px 8px",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "background 300ms, color 300ms, border-color 300ms",
                  ...(hit
                    ? { background: "rgba(198,255,58,0.25)", color: "#405410", border: "1px solid rgba(110,150,20,0.2)" }
                    : { background: "rgba(10,10,10,0.04)", color: "#8a8a85", border: "1px solid rgba(10,10,10,0.06)" }),
                }}
              >
                {hit ? "✓" : "○"} {k.word}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={{ borderTop: "1px solid rgba(10,10,10,0.06)", paddingTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: MONO,
              fontSize: 11,
              color: "#3a3a38",
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            <span>Ajustando seções</span>
            <span style={{ color: "#0a0a0a" }}>{Math.round(pct * 100)}%</span>
          </div>
          <div style={{ height: 4, background: "rgba(10,10,10,0.08)", borderRadius: 99, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                background: "#0a0a0a",
                borderRadius: 99,
                width: `${pct * 100}%`,
                transition: "width 80ms linear",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
