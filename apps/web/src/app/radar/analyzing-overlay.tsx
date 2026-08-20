"use client";

import { useEffect, useState } from "react";
import { EcvScanLoader } from "@/components/ecv-loader";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const LOADING_STEPS = [
  "Lendo seu CV...",
  "Comparando com a vaga...",
  "Identificando gaps...",
  "Melhorando seu CV...",
];

// Overlay full-screen igual ao usado em /adaptar durante o processamento —
// reaproveitado aqui pros dois pontos do radar que disparam análise direto
// com o CV master (card da listagem e detalhe da vaga), pra não deixar a
// tela clicável/scrollável enquanto a análise roda.
export function AnalyzingOverlay() {
  const [loadingStep, setLoadingStep] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const intervals = [0, 3000, 6000, 10000];
    const timers = intervals.map((delay, i) =>
      setTimeout(() => setLoadingStep(i), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const dotsTimer = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(dotsTimer);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 16px",
        background: "rgba(10,10,10,0.35)",
        backdropFilter: "blur(4px)",
        width: "100vw",
        height: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#0a0a0a",
          padding: "32px",
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 32px 80px -16px rgba(0,0,0,0.8)",
        }}
      >
        <EcvScanLoader size={64} dark />

        <p
          style={{
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: -0.01,
            color: "#fafaf6",
            margin: 0,
            fontFamily: GEIST,
          }}
        >
          Analisando...
        </p>

        <div style={{ height: 22, textAlign: "center" }}>
          <p
            style={{
              fontSize: 13,
              color: "#a0a09a",
              margin: 0,
              fontFamily: GEIST,
            }}
          >
            {LOADING_STEPS[loadingStep]}
            {".".repeat(dots)}
          </p>
        </div>

        <p
          style={{
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 10,
            color: "#5a5a55",
            margin: 0,
          }}
        >
          Isso pode levar alguns segundos
        </p>
      </div>
    </div>
  );
}
