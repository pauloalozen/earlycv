"use client";

import { useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";

// O toggle/cron/batch size do worker migraram pro IngestionJob de tipo
// ENRICHMENT (aba Jobs) — esse controle fica so com o disparo manual
// direto do worker, pra debugging rapido sem passar pelo sistema de Jobs.
export function EnrichmentWorkerControls() {
  const [runningNow, setRunningNow] = useState(false);

  async function handleRunNow() {
    setRunningNow(true);
    try {
      const res = await fetch("/api/admin/ingestion/enrichment/run-now", {
        method: "POST",
      });
      if (!res.ok) {
        window.alert("Falha ao disparar o worker agora.");
        return;
      }
      const data: { processed: number } = await res.json();
      window.alert(
        `Enriquecimento disparado: ${data.processed} vaga(s) processada(s).`,
      );
    } finally {
      setRunningNow(false);
    }
  }

  return (
    <div className="mb-6 flex items-center justify-between rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-900">
        Enriquecimento
      </h2>
      <button
        className={buttonVariants({ size: "sm", variant: "outline" })}
        disabled={runningNow}
        onClick={handleRunNow}
        type="button"
      >
        {runningNow ? "Processando..." : "Processar agora"}
      </button>
    </div>
  );
}
