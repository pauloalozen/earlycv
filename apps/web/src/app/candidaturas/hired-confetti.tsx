"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";

const DURATION_MS = 4200;

// Comemoração de "Contratado" na tela toda (quadro de /candidaturas): mesmo
// confete do modal de contratação do detalhe (HiredConfetti), caindo sobre a
// viewport inteira. Não bloqueia cliques, some sozinho e respeita "reduzir
// movimento" do sistema (aí nem aparece).
export function FullScreenConfetti({ onDone }: { onDone: () => void }) {
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      onDone();
      return;
    }
    const fade = window.setTimeout(() => setFading(true), DURATION_MS - 500);
    const done = window.setTimeout(onDone, DURATION_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [onDone, reducedMotion]);

  const pieces = useMemo(() => {
    const rand = (seed: number) => {
      const x = Math.sin(seed * 9999) * 10000;
      return x - Math.floor(x);
    };
    return Array.from({ length: 90 }, (_, i) => {
      const r1 = rand(i + 1);
      const r2 = rand(i + 31);
      const r3 = rand(i + 71);
      const r4 = rand(i + 113);
      return {
        i,
        left: r1 * 100,
        dx: (r2 - 0.5) * 320,
        rot: 200 + r3 * 720,
        dur: 2.2 + r4 * 1.6,
        delay: r2 * 0.6,
        size: 7 + r2 * 9,
        color: (
          ["#c6ff3a", "#0a0a0a", "#f5c518", "#fafaf6", "#c6ff3a"] as const
        )[Math.floor(r3 * 5)],
        shape: r4 > 0.5 ? "rect" : "circle",
      };
    });
  }, []);

  if (reducedMotion) return null;

  return (
    <div
      aria-hidden
      data-testid="hired-confetti"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        pointerEvents: "none",
        overflow: "hidden",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.5s ease",
      }}
    >
      <style>{`
        @keyframes kb-confetti-fall {
          0%   { transform: translate3d(0,-6vh,0) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translate3d(var(--dx,0),108vh,0) rotate(var(--rot,540deg)); opacity: 0.9; }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.i}
          style={
            {
              position: "absolute",
              left: `${p.left}%`,
              top: 0,
              width: p.size,
              height: p.shape === "circle" ? p.size : p.size * 0.5,
              background: p.color,
              borderRadius: p.shape === "circle" ? "50%" : 2,
              opacity: 0,
              "--dx": `${p.dx}px`,
              "--rot": `${p.rot}deg`,
              animation: `kb-confetti-fall ${p.dur}s cubic-bezier(0.22,0.61,0.36,1) ${p.delay}s 1 forwards`,
              boxShadow:
                p.color === "#c6ff3a"
                  ? "0 0 8px rgba(198,255,58,0.4)"
                  : p.color === "#fafaf6"
                    ? "0 0 0 1px rgba(10,10,10,0.08)"
                    : "none",
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
