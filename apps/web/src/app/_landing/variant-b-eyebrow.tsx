"use client";

import { useEffect, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";

// Reference: count = 63 at 2026-05-07T00:00:00Z
const REFERENCE_MS = new Date("2026-05-07T00:00:00Z").getTime();
const BASE_COUNT = 63;
const PERIOD_MS = 2 * 60 * 60 * 1000; // 2 hours

function getCount(now: number): number {
  const elapsed = Math.max(0, now - REFERENCE_MS);
  const periods = Math.floor(elapsed / PERIOD_MS);
  let count = BASE_COUNT;
  for (let i = 0; i < periods; i++) {
    // Deterministic pseudo-random 2–6 per period via Knuth hash
    const hash = (Math.imul(i + 1, 2654435761) >>> 0);
    count += (hash % 5) + 2;
  }
  return count;
}

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
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: MONO,
        fontSize: 10.5,
        letterSpacing: 1.2,
        fontWeight: 500,
        color: "#555",
        background: "rgba(10,10,10,0.04)",
        border: "1px solid rgba(10,10,10,0.06)",
        padding: "6px 10px",
        borderRadius: 999,
        marginBottom: 28,
      }}
    >
      <span className="b-dot-pulse" />
      Beta aberto ·{" "}
      <span suppressHydrationWarning>{count}</span>{" "}
      adaptações geradas essa semana
    </div>
  );
}
