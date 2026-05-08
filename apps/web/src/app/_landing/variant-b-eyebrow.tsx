"use client";

import { useEffect, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";

const PERIOD_MS = 4 * 60 * 60 * 1000; // 4 hours

function getWeekStart(now: number): number {
  const d = new Date(now);
  const daysFromMonday = (d.getUTCDay() + 6) % 7;
  const s = new Date(d);
  s.setUTCHours(0, 0, 0, 0);
  s.setUTCDate(d.getUTCDate() - daysFromMonday);
  return s.getTime();
}

function getCount(now: number): number {
  const weekStart = getWeekStart(now);
  const weekNumber = Math.floor(weekStart / (7 * 24 * 60 * 60 * 1000));
  const baseHash = Math.imul(weekNumber, 2654435761) >>> 0;
  const base = 18 + (baseHash % 5); // 18–22 at week start
  const periods = Math.floor(Math.max(0, now - weekStart) / PERIOD_MS);
  let count = base;
  for (let i = 0; i < periods; i++) {
    // 1–2 per 4-hour period → ~83 by end of week
    const hash = Math.imul(i + 1, 2654435761) >>> 0;
    count += (hash % 2) + 1;
  }
  return count;
}

const BASE_COUNT = getCount(new Date("2026-05-08T12:00:00Z").getTime());

export function HeroEyebrow() {
  // SSR: always renders BASE_COUNT to avoid hydration mismatch
  const [count, setCount] = useState(BASE_COUNT);

  useEffect(() => {
    setCount(getCount(Date.now()));
    const interval = setInterval(
      () => setCount(getCount(Date.now())),
      10 * 60 * 1000, // re-check every 10 minutes
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div
        className="b-hero-eyebrow"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: 2,
          fontWeight: 500,
          textTransform: "uppercase",
          color: "#555",
          background: "rgba(10,10,10,0.04)",
          border: "1px solid rgba(10,10,10,0.06)",
          padding: "6px 10px",
          borderRadius: 999,
          marginBottom: 28,
        }}
      >
        <span className="b-dot-pulse" />
        <span suppressHydrationWarning>{count}</span> adaptações geradas essa
        semana
      </div>
      <style>{`
        @media (max-width: 768px) {
          .b-hero-eyebrow {
            margin-bottom: 16px !important;
            max-width: 100%;
            font-size: 10px !important;
            letter-spacing: 1.4px !important;
          }
        }
      `}</style>
    </>
  );
}
