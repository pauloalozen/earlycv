"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const TOAST_MS = 3000;

// Mesmo padrão visual do Toast de /radar/analysis-cta.tsx (pílula escura)
// — projeto não tem um Toast compartilhado ainda, então replica o mesmo
// estilo já usado em produção em vez de inventar um novo. Posição e barra
// de progresso ajustadas 2026-09-10: canto inferior direito, mesma margem
// da borda, com contador visual de 3s até fechar sozinho.
export function SaveToast() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const saved = searchParams.get("saved");
  const [visible, setVisible] = useState(false);
  // Chave que muda a cada exibição — reinicia a animação CSS da barra de
  // progresso mesmo se o toast for disparado de novo antes do anterior
  // fechar (autosave frequente ao editar vários blocos em sequência).
  const [toastKey, setToastKey] = useState(0);

  useEffect(() => {
    if (!saved) return;
    setVisible(true);
    setToastKey((k) => k + 1);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("saved");
    const query = params.toString();
    router.replace(
      query ? `/meu-cv-master?${query}` : "/meu-cv-master",
      { scroll: false },
    );

    const timer = setTimeout(() => setVisible(false), TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  if (!visible) return null;

  return (
    <div
      key={toastKey}
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 100,
        background: "#0a0a0a",
        color: "#fafaf6",
        borderRadius: 10,
        overflow: "hidden",
        maxWidth: "calc(100vw - 32px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontFamily: GEIST,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="#c6ff3a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <title>Salvo</title>
          <path d="M2.5 7.5l3 3 6-6" />
        </svg>
        <span>CV salvo</span>
      </div>
      <div style={{ height: 2, background: "rgba(250,250,246,0.14)" }}>
        <div
          style={{
            height: "100%",
            background: "#c6ff3a",
            animation: `save-toast-countdown ${TOAST_MS}ms linear forwards`,
          }}
        />
      </div>
      <style>{`
        @keyframes save-toast-countdown {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
