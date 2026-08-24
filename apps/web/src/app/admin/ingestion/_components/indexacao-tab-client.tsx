"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";
import type { GoogleIndexingBackfillStatus } from "@/lib/admin-ingestion-api";

const STAT_ITEMS: Array<{
  key: keyof GoogleIndexingBackfillStatus;
  label: string;
}> = [
  { key: "totalEligible", label: "Elegíveis" },
  { key: "notified", label: "Notificadas" },
  { key: "pending", label: "Pendentes (passivo)" },
  { key: "dailyLimit", label: "Cota diária" },
  { key: "estimatedDaysRemaining", label: "Dias restantes (estimado)" },
];

export function IndexacaoTabClient() {
  const [status, setStatus] = useState<GoogleIndexingBackfillStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/admin/ingestion/google-indexing/backfill-status",
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("failed to fetch status");
      setStatus(await res.json());
      setError(null);
    } catch {
      setError("Não foi possível carregar o status da indexação.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleRunNow() {
    if (!status?.ingestionJobId) return;
    setRunning(true);
    try {
      await fetch(
        `/api/admin/ingestion/ingestion-jobs/${status.ingestionJobId}/run-now`,
        { method: "POST" },
      );
      await fetchStatus();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          alignItems: "start",
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <p style={{ color: AT.muted, fontSize: 13, maxWidth: 560 }}>
          Notifica a Google Indexing API sobre vagas ativas com enriquecimento
          concluído ainda não notificadas, respeitando a cota diária. Roda
          automaticamente todo dia às 3h — o botão abaixo dispara um lote agora,
          fora do horário agendado.
        </p>
        <button
          className={buttonVariants({ variant: "outline" })}
          disabled={!status?.ingestionJobId || running}
          onClick={handleRunNow}
          type="button"
        >
          {running ? "Rodando…" : "Rodar agora"}
        </button>
      </div>

      {error && <p style={{ color: AT.danger, fontSize: 13 }}>{error}</p>}

      {!loading && status && (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(5, 1fr)",
          }}
        >
          {STAT_ITEMS.map((item) => (
            <div key={item.key}>
              <div
                style={{
                  color: AT.muted2,
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: 1.1,
                  textTransform: "uppercase",
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  color: AT.ink2,
                  fontSize: 26,
                  fontWeight: 500,
                  letterSpacing: -1,
                  marginTop: 4,
                }}
              >
                {status[item.key]}
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ color: AT.muted, fontSize: 12 }}>
        Histórico de execuções (agendadas e manuais) fica na aba{" "}
        <strong>Jobs</strong>, job “Indexação de vagas (Google)”.
      </p>
    </div>
  );
}
