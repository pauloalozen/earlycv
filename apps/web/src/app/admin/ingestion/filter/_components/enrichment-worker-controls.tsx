"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AdminPill, AT } from "@/app/admin/_components/admin-primitives";

type EnrichmentConfig = {
  enrichmentBatchSize: number;
  enrichmentCronExpression: string;
  enrichmentEnabled: boolean;
};

type EnrichmentBatchRun = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  triggeredBy: "SCHEDULE" | "MANUAL";
  batchSize: number;
  processedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

const SECOND_PRESETS = [10, 20, 30, 50, 60];
const CUSTOM_PRESET = "custom";
const RUNS_POLL_MS = 3_000;

const RUN_STATUS_TONE: Record<
  EnrichmentBatchRun["status"],
  "neutral" | "warn" | "ok" | "danger"
> = {
  CANCELLED: "neutral",
  COMPLETED: "ok",
  FAILED: "danger",
  QUEUED: "neutral",
  RUNNING: "warn",
};

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

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
  });
}

export function EnrichmentWorkerControls() {
  const [config, setConfig] = useState<EnrichmentConfig | null>(null);
  const [secondsPreset, setSecondsPreset] = useState<string>("10");
  const [customSeconds, setCustomSeconds] = useState("10");
  const [batchSizeDraft, setBatchSizeDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [currentRun, setCurrentRun] = useState<EnrichmentBatchRun | null>(null);
  const [runs, setRuns] = useState<EnrichmentBatchRun[]>([]);
  // Separado do polling de fundo (3s) de proposito — se os dois
  // compartilhassem o mesmo estado, o rotulo do botao "Atualizar" ficaria
  // alternando pra "Atualizando..." a cada ciclo do polling automatico,
  // mesmo sem o usuario ter clicado em nada.
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const fetchRuns = useCallback(async () => {
    const [currentRes, historyRes] = await Promise.all([
      fetch("/api/admin/ingestion/enrichment/runs/current", {
        cache: "no-store",
      }),
      fetch("/api/admin/ingestion/enrichment/runs", { cache: "no-store" }),
    ]);
    if (currentRes.ok) {
      const data = await currentRes.json();
      setCurrentRun(data ?? null);
    }
    if (historyRes.ok) setRuns(await historyRes.json());
  }, []);

  async function handleManualRefresh() {
    setManualRefreshPending(true);
    try {
      await fetchRuns();
    } finally {
      setManualRefreshPending(false);
    }
  }

  useEffect(() => {
    fetchConfig();
    fetchRuns();
  }, [fetchConfig, fetchRuns]);

  useEffect(() => {
    pollingRef.current = setInterval(fetchRuns, RUNS_POLL_MS);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchRuns]);

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
      await fetchRuns();
    } finally {
      setRunningNow(false);
    }
  }

  async function handleCancel(runId: string) {
    setCancelPending(true);
    try {
      await fetch(`/api/admin/ingestion/enrichment/runs/${runId}/cancel`, {
        method: "POST",
      });
      await fetchRuns();
    } finally {
      setCancelPending(false);
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
          {runningNow ? "Disparando..." : "Processar agora"}
        </button>
      </div>

      {message ? (
        <p className="mb-3 text-xs text-stone-600">{message}</p>
      ) : null}

      {/* Lote em andamento — pra sempre saber que um disparo (schedule ou
          manual) esta rodando de verdade, e poder para-lo. */}
      {currentRun && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
            </span>
            <span className="text-sm text-stone-800">
              Lote em andamento: {currentRun.processedCount}/
              {currentRun.batchSize} processados (
              {currentRun.triggeredBy === "MANUAL" ? "manual" : "automatico"})
            </span>
          </div>
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            disabled={cancelPending}
            onClick={() => handleCancel(currentRun.id)}
            type="button"
          >
            {cancelPending ? "Cancelando..." : "Cancelar"}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Historico de lotes
        </h3>
        <button
          className={buttonVariants({ size: "sm", variant: "outline" })}
          disabled={manualRefreshPending}
          onClick={handleManualRefresh}
          type="button"
        >
          {manualRefreshPending ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div className="mt-2 overflow-x-auto rounded-lg border border-stone-200">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-stone-100 bg-stone-50 text-stone-500">
            <tr>
              <th className="px-3 py-2">Início</th>
              <th className="px-3 py-2">Disparo</th>
              <th className="px-3 py-2">Lote</th>
              <th className="px-3 py-2">Processados</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Fim</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td
                  className="px-3 py-4 text-center text-stone-400"
                  colSpan={6}
                >
                  Nenhuma execução registrada.
                </td>
              </tr>
            )}
            {runs.map((run) => (
              <tr className="border-t border-stone-100" key={run.id}>
                <td className="px-3 py-2 text-stone-600">
                  {formatDateTime(run.startedAt ?? run.createdAt)}
                </td>
                <td className="px-3 py-2 text-stone-600">
                  {run.triggeredBy === "MANUAL" ? "manual" : "automatico"}
                </td>
                <td className="px-3 py-2 text-stone-600">{run.batchSize}</td>
                <td className="px-3 py-2 text-stone-600">
                  {run.processedCount}/{run.batchSize}
                </td>
                <td className="px-3 py-2">
                  <AdminPill mono tone={RUN_STATUS_TONE[run.status]}>
                    {run.status}
                  </AdminPill>
                </td>
                <td className="px-3 py-2 text-stone-600">
                  {formatDateTime(run.finishedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
