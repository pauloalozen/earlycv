"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";

type EnrichmentConfig = {
  enrichmentBatchSize: number;
  enrichmentCronExpression: string;
  enrichmentEnabled: boolean;
};

export function EnrichmentWorkerControls() {
  const [config, setConfig] = useState<EnrichmentConfig | null>(null);
  const [cronDraft, setCronDraft] = useState("");
  const [batchSizeDraft, setBatchSizeDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/admin/ingestion/enrichment/config");
    if (!res.ok) return;
    const data: EnrichmentConfig = await res.json();
    setConfig(data);
    setCronDraft(data.enrichmentCronExpression);
    setBatchSizeDraft(String(data.enrichmentBatchSize));
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function updateConfig(body: Partial<EnrichmentConfig>) {
    const res = await fetch("/api/admin/ingestion/enrichment/config", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    if (res.ok) {
      const data: EnrichmentConfig = await res.json();
      setConfig(data);
      setCronDraft(data.enrichmentCronExpression);
      setBatchSizeDraft(String(data.enrichmentBatchSize));
    }
    return res.ok;
  }

  async function handleToggle() {
    if (!config) return;
    setTogglePending(true);
    await updateConfig({ enrichmentEnabled: !config.enrichmentEnabled });
    setTogglePending(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const batchSize = Number.parseInt(batchSizeDraft, 10);
    const ok = await updateConfig({
      enrichmentBatchSize: Number.isFinite(batchSize) ? batchSize : undefined,
      enrichmentCronExpression: cronDraft,
    });
    setMessage(ok ? "Config salva." : "Falha ao salvar config.");
    setSaving(false);
  }

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
    <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-900">
          Worker de enriquecimento
        </h2>
        <div className="flex items-center gap-2">
          <button
            disabled={togglePending || !config}
            onClick={handleToggle}
            style={{
              background: config?.enrichmentEnabled ? AT.ok : AT.faint,
              border: "none",
              borderRadius: 10,
              cursor: togglePending ? "not-allowed" : "pointer",
              flexShrink: 0,
              height: 20,
              position: "relative",
              transition: "background 0.2s",
              width: 36,
            }}
            title={
              config?.enrichmentEnabled ? "Desativar worker" : "Ativar worker"
            }
            type="button"
          >
            <span
              style={{
                background: "white",
                borderRadius: "50%",
                height: 16,
                left: config?.enrichmentEnabled ? 18 : 2,
                position: "absolute",
                top: 2,
                transition: "left 0.2s",
                width: 16,
              }}
            />
          </button>
          <span
            style={{
              color: AT.muted,
              fontFamily: '"Geist Mono", monospace',
              fontSize: 11.5,
            }}
          >
            {config === null
              ? "carregando..."
              : config.enrichmentEnabled
                ? "ativo"
                : "desativado"}
          </span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label
            className="mb-1 block text-xs font-medium text-stone-700"
            htmlFor="enrichmentCronExpression"
          >
            Cron (6 campos, com segundos)
          </label>
          <input
            className="h-9 w-56 rounded-md border px-3 text-[12.5px]"
            id="enrichmentCronExpression"
            onChange={(event) => setCronDraft(event.target.value)}
            style={{
              background: "#fafaf6",
              borderColor: "rgba(10,10,10,0.08)",
              color: "#2a2620",
            }}
            value={cronDraft}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-xs font-medium text-stone-700"
            htmlFor="enrichmentBatchSize"
          >
            Batch size
          </label>
          <input
            className="h-9 w-24 rounded-md border px-3 text-[12.5px]"
            id="enrichmentBatchSize"
            min={1}
            onChange={(event) => setBatchSizeDraft(event.target.value)}
            style={{
              background: "#fafaf6",
              borderColor: "rgba(10,10,10,0.08)",
              color: "#2a2620",
            }}
            type="number"
            value={batchSizeDraft}
          />
        </div>
        <button
          className={buttonVariants({ size: "sm" })}
          disabled={saving || !config}
          onClick={handleSave}
          type="button"
        >
          {saving ? "Salvando..." : "Salvar config"}
        </button>
        <button
          className={buttonVariants({ size: "sm", variant: "outline" })}
          disabled={runningNow}
          onClick={handleRunNow}
          type="button"
        >
          {runningNow ? "Disparando..." : "Disparar agora"}
        </button>
      </div>

      {message ? <p className="text-xs text-stone-600">{message}</p> : null}
    </div>
  );
}
