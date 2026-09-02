"use client";

import { useEffect, useState } from "react";
import { getMonitorCount } from "@/lib/monitor-api";

const MONO = "var(--font-geist-mono), monospace";

// Badge de novas oportunidades do Meu Monitor na navegação autenticada —
// só busca a contagem quando `enabled` (usuário logado); uma leitura por
// montagem da navbar é suficiente pra esse indicador, sem polling
// contínuo em toda página do site.
export function MonitorNavBadge({ enabled }: { enabled: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getMonitorCount()
      .then((result) => {
        if (!cancelled) setCount(result.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || count <= 0) return null;

  return (
    <span
      role="status"
      aria-label={`${count} novas oportunidades no Alerta de Vaga Certa`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 99,
        background: "#c6ff3a",
        color: "#25330a",
        fontFamily: MONO,
        fontSize: 9.5,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
