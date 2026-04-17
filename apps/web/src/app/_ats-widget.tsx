"use client";

import { useEffect, useState } from "react";

export function AtsWidget() {
  const [score, setScore] = useState(34);

  useEffect(() => {
    let frame: number;
    let start = performance.now();
    const dur = 2800;
    const pause = 1500;

    function tick(now: number) {
      const t = now - start;
      if (t < dur) {
        const p = t / dur;
        const eased = 1 - Math.pow(1 - p, 3);
        setScore(Math.round(34 + (92 - 34) * eased));
      } else if (t < dur + pause) {
        setScore(92);
      } else {
        start = now;
        setScore(34);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const R = 72;
  const C = 2 * Math.PI * R;
  const dash = C * (score / 100);
  const isGreen = score >= 80;
  const strokeColor = isGreen ? "#c6ff3a" : "#f5c518";
  const pct = score / 100;

  const keywords = [
    { word: "React", hit: true },
    { word: "TypeScript", hit: true },
    { word: "Node.js", hit: true },
    { word: "AWS", hit: score > 60 },
    { word: "CI/CD", hit: score > 70 },
    { word: "GraphQL", hit: score > 80 },
  ];

  return (
    <div
      style={{
        width: 440,
        maxWidth: "100%",
        background: "#fafaf6",
        borderRadius: 14,
        border: "1px solid rgba(10,10,10,0.08)",
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(10,10,10,0.18)",
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
            fontFamily: "var(--font-geist-mono), monospace",
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
      <div style={{ padding: "22px 26px 26px" }}>
        {/* Live label */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontFamily: "var(--font-geist-mono), monospace",
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
          ANALISANDO CV PARA VAGA · SENIOR DEV
        </div>

        {/* Gauge */}
        <div
          style={{
            position: "relative",
            width: 180,
            height: 180,
            margin: "0 auto 20px",
          }}
        >
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
          <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden>
            <circle cx="90" cy="90" r={R} stroke="#1a1a1a" strokeWidth="10" fill="none" />
            <circle
              cx="90"
              cy="90"
              r={R}
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
            <span
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 9.5,
                letterSpacing: 1.5,
                color: "#7a7a74",
                marginTop: 4,
              }}
            >
              ATS SCORE
            </span>
          </div>
        </div>

        {/* Keywords */}
        <p
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            letterSpacing: 0.8,
            color: "#7a7a74",
            marginBottom: 10,
            fontWeight: 500,
          }}
        >
          Palavras-chave detectadas
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 6,
            marginBottom: 18,
          }}
        >
          {keywords.map((k) => (
            <div
              key={k.word}
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 11,
                fontWeight: 500,
                padding: "6px 8px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 5,
                ...(k.hit
                  ? {
                      background: "rgba(198,255,58,0.25)",
                      color: "#405410",
                      border: "1px solid rgba(110,150,20,0.2)",
                    }
                  : {
                      background: "rgba(10,10,10,0.04)",
                      color: "#8a8a85",
                      border: "1px solid rgba(10,10,10,0.06)",
                    }),
              }}
            >
              {k.hit ? "✓" : "○"} {k.word}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ borderTop: "1px solid rgba(10,10,10,0.06)", paddingTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "#3a3a38",
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            <span>Ajustando seções</span>
            <span style={{ color: "#0a0a0a" }}>{Math.round(pct * 100)}%</span>
          </div>
          <div
            style={{
              height: 4,
              background: "rgba(10,10,10,0.08)",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
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
