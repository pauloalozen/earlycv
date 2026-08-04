"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";

type EnrichmentConfig = {
  enrichmentBatchSize: number;
  enrichmentCronExpression: string;
  enrichmentEnabled: boolean;
};

const SECOND_PRESETS = [10, 20, 30, 50, 60];
const CUSTOM_PRESET = "custom";

// enrichmentCronExpression e um cron de 6 campos (com segundos). O admin
// so precisa expressar "a cada N segundos" — os outros 5 campos ficam
// sempre "*". Qualquer cron fora desse padrao (setado manualmente antes)
// cai no modo "custom" com o valor em segundos que conseguirmos extrair.
function extractSeconds(cron: string | undefined): number | null {
  if (typeof cron !== "string") return null;
  const match = cron.match(/^\*\/(\d+) \* \* \* \* \*$/);
  return match ? Number(match[1]) : null;
}

function buildCronFromSeconds(seconds: number): string {
  return `*/${seconds} * * * * *`;
}

export function EnrichmentWorkerControls() {
  const [config, setConfig] = useState<EnrichmentConfig | null>(null);
  const [secondsPreset, setSecondsPreset] = useState<string>("10");
  const [customSeconds, setCustomSeconds] = useState("10");
  const [batchSizeDraft, setBatchSizeDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const applyConfig = useCallback((data: EnrichmentConfig) => {
    setConfig(data);
    setBatchSizeDraft(String(data.enrichmentBatchSize));
    const seconds = extractSeconds(data.enrichmentCronExpression);
    if (seconds !== null && SECOND_PRESETS.includes(seconds)) {
      setSecondsPreset(String(seconds));
    } else {
      setSecondsPreset(CUSTOM_PRESET);
      setCustomSeconds(String(seconds ?? 10));
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/admin/ingestion/enrichment/config");
    if (!res.ok) return;
    applyConfig(await res.json());
  }, [applyConfig]);

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
      applyConfig(await res.json());
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
    const seconds =
      secondsPreset === CUSTOM_PRESET
        ? Number.parseInt(customSeconds, 10)
        : Number.parseInt(secondsPreset, 10);

    if (!Number.isFinite(seconds) || seconds < 1) {
      setMessage("Intervalo em segundos invalido.");
      setSaving(false);
      return;
    }

    const ok = await updateConfig({
      enrichmentBatchSize: Number.isFinite(batchSize) ? batchSize : undefined,
      enrichmentCronExpression: buildCronFromSeconds(seconds),
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
            htmlFor="enrichmentSeconds"
          >
            Rodar a cada
          </label>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border px-3 text-[12.5px]"
              id="enrichmentSeconds"
              onChange={(event) => setSecondsPreset(event.target.value)}
              style={{
                background: "#fafaf6",
                borderColor: "rgba(10,10,10,0.08)",
                color: "#2a2620",
              }}
              value={secondsPreset}
            >
              {SECOND_PRESETS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds}s
                </option>
              ))}
              <option value={CUSTOM_PRESET}>outro...</option>
            </select>
            {secondsPreset === CUSTOM_PRESET && (
              <input
                aria-label="Intervalo customizado em segundos"
                className="h-9 w-20 rounded-md border px-3 text-[12.5px]"
                min={1}
                onChange={(event) => setCustomSeconds(event.target.value)}
                style={{
                  background: "#fafaf6",
                  borderColor: "rgba(10,10,10,0.08)",
                  color: "#2a2620",
                }}
                type="number"
                value={customSeconds}
              />
            )}
            <span
              style={{
                color: AT.muted,
                fontFamily: '"Geist Mono", monospace',
                fontSize: 11.5,
              }}
            >
              segundos
            </span>
          </div>
        </div>
        <div>
          <label
            className="mb-1 block text-xs font-medium text-stone-700"
            htmlFor="enrichmentBatchSize"
          >
            Tamanho do lote
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
          {runningNow ? "Processando..." : "Processar agora"}
        </button>
      </div>

      {message ? <p className="text-xs text-stone-600">{message}</p> : null}
    </div>
  );
}
