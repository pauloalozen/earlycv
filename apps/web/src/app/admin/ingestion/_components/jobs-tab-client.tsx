"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";

type ScopeType = "ADAPTER" | "SOURCE" | "ALL";
type ScheduleType = "MANUAL" | "DAILY" | "EVERY_N_HOURS" | "WEEKLY";
type JobType =
  | "CRAWL"
  | "ENRICHMENT"
  | "LOGO_FETCH"
  | "DISCOVERY_VALIDATE"
  | "GOOGLE_INDEXING_BACKFILL";

// Adapters com extractor de logo implementado no backend (ver
// LOGO_EXTRACTORS em apps/api/src/ingestion/company-logo/logo-extractors.ts)
// — só esses aparecem no seletor de "carregar logo". Lista mantida à mão
// aqui, mesmo padrão da lista de adapters do escopo CRAWL logo abaixo.
const LOGO_FETCH_ADAPTER_OPTIONS = [
  "gupy",
  "inhire",
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "teamtailor",
  "pandape",
];

type IngestionJobRow = {
  id: string;
  name: string;
  jobType: JobType;
  scopeType: ScopeType | null;
  adapterType: string | null;
  discoveryValidateLimit: number | null;
  jobSourceId: string | null;
  jobSource: {
    id: string;
    sourceName: string;
    company: { name: string };
  } | null;
  scheduleType: ScheduleType;
  scheduleHour: number | null;
  scheduleMinute: number;
  scheduleInterval: number | null;
  scheduleDaysOfWeek: number[];
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type IngestionJobRunRow = {
  id: string;
  jobId: string | null;
  // job vira null quando o job original foi excluido — jobName/jobType
  // sao o snapshot tirado no momento da execucao, sobrevivem a exclusao e
  // sao o fallback usado pra exibicao (ver runJobLabel/runJobType).
  job: { id: string; name: string; jobType: JobType } | null;
  jobName: string;
  jobType: JobType;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  triggeredBy: "SCHEDULE" | "MANUAL";
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  batchRunId: string | null;
  batchRun: {
    status: string;
    totalSources: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
  } | null;
  createdAt: string;
};

type RunsResponse = {
  runs: IngestionJobRunRow[];
  total: number;
  page: number;
  pageSize: number;
};

type SourceOption = { id: string; label: string };

type Props = {
  sources: SourceOption[];
  initialCreateSourceId?: string;
  initialCreateSourceName?: string;
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function frequencyLabel(job: IngestionJobRow) {
  const hh = String(job.scheduleHour ?? 0).padStart(2, "0");
  const mm = String(job.scheduleMinute).padStart(2, "0");
  switch (job.scheduleType) {
    case "MANUAL":
      return "Manual";
    case "DAILY":
      return `Todo dia às ${hh}:${mm}`;
    case "EVERY_N_HOURS":
      return `A cada ${job.scheduleInterval ?? "?"} horas`;
    case "WEEKLY": {
      const days = job.scheduleDaysOfWeek
        .slice()
        .sort()
        .map((d) => WEEKDAY_LABELS[d])
        .join(", ");
      return `Toda semana (${days}) às ${hh}:${mm}`;
    }
    default:
      return "—";
  }
}

function scopeLabel(job: IngestionJobRow) {
  if (
    job.jobType === "ENRICHMENT" ||
    job.jobType === "GOOGLE_INDEXING_BACKFILL"
  ) {
    return "—";
  }
  if (job.jobType === "DISCOVERY_VALIDATE") {
    return job.discoveryValidateLimit
      ? `Até ${job.discoveryValidateLimit} candidato(s)`
      : "Fila inteira";
  }
  if (job.scopeType === "ADAPTER") return `Adapter: ${job.adapterType ?? "?"}`;
  if (job.scopeType === "SOURCE") {
    return job.jobSource
      ? `${job.jobSource.company.name} · ${job.jobSource.sourceName}`
      : "Fonte específica";
  }
  return job.jobType === "LOGO_FETCH"
    ? "Todos os adapters implementados"
    : "Todas as fontes ativas";
}

const RUN_STATUS_TONE: Record<
  IngestionJobRunRow["status"],
  "neutral" | "warn" | "ok" | "danger"
> = {
  CANCELLED: "neutral",
  COMPLETED: "ok",
  FAILED: "danger",
  QUEUED: "neutral",
  RUNNING: "warn",
};

function CreateJobModal({
  onClose,
  onCreated,
  sources,
  initialSourceId,
  initialSourceLabel,
}: {
  onClose: () => void;
  onCreated: () => void;
  sources: SourceOption[];
  initialSourceId?: string;
  initialSourceLabel?: string;
}) {
  const [name, setName] = useState(
    initialSourceLabel ? `Crawl — ${initialSourceLabel}` : "",
  );
  // ENRICHMENT fica fora do seletor: granularidade incompativel com o
  // sistema de Jobs (ver EnrichmentWorkerControls, que continua sendo o
  // mecanismo real de enriquecimento continuo). CRAWL e LOGO_FETCH usam o
  // mesmo escopo ADAPTER/SOURCE/ALL (LOGO_FETCH so nao oferece SOURCE, ver
  // abaixo — logo e por Company, nao por JobSource individual).
  const [jobType, setJobType] = useState<JobType>("CRAWL");
  const [scopeType, setScopeType] = useState<ScopeType>(
    initialSourceId ? "SOURCE" : "ALL",
  );
  const [adapterType, setAdapterType] = useState("gupy");
  const [onlyMissingLogo, setOnlyMissingLogo] = useState(true);
  const [discoveryValidateLimit, setDiscoveryValidateLimit] = useState("30");

  function handleJobTypeChange(next: JobType) {
    setJobType(next);
    // LOGO_FETCH nao oferece escopo SOURCE — se o usuario trocar de CRAWL
    // (com SOURCE ja selecionado) pra LOGO_FETCH, cai pra ALL.
    if (next === "LOGO_FETCH" && scopeType === "SOURCE") {
      setScopeType("ALL");
    }
    if (
      next === "LOGO_FETCH" &&
      !LOGO_FETCH_ADAPTER_OPTIONS.includes(adapterType)
    ) {
      setAdapterType(LOGO_FETCH_ADAPTER_OPTIONS[0]);
    }
  }
  const [jobSourceId, setJobSourceId] = useState(initialSourceId ?? "");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("DAILY");
  const [scheduleHour, setScheduleHour] = useState("7");
  const [scheduleMinute, setScheduleMinute] = useState("0");
  const [scheduleInterval, setScheduleInterval] = useState("6");
  const [scheduleDaysOfWeek, setScheduleDaysOfWeek] = useState<number[]>([
    1, 2, 3, 4, 5,
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setScheduleDaysOfWeek((days) =>
      days.includes(day)
        ? days.filter((d) => d !== day)
        : [...days, day].sort(),
    );
  }

  async function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError("Nome do job é obrigatório.");
      return;
    }
    if (jobType === "CRAWL" && scopeType === "SOURCE" && !jobSourceId) {
      setError("Selecione uma fonte.");
      return;
    }
    if (scheduleType === "WEEKLY" && scheduleDaysOfWeek.length === 0) {
      setError("Selecione ao menos um dia da semana.");
      return;
    }

    const body: Record<string, unknown> = {
      jobType,
      name: name.trim(),
      scheduleMinute: Number(scheduleMinute) || 0,
      scheduleType,
    };

    if (jobType === "CRAWL" || jobType === "LOGO_FETCH") {
      body.scopeType = scopeType;
      if (scopeType === "ADAPTER") body.adapterType = adapterType;
      if (scopeType === "SOURCE") body.jobSourceId = jobSourceId;
    }
    if (jobType === "LOGO_FETCH") {
      body.onlyMissingLogo = onlyMissingLogo;
    }
    if (jobType === "DISCOVERY_VALIDATE" && discoveryValidateLimit.trim()) {
      const parsed = Number.parseInt(discoveryValidateLimit, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        body.discoveryValidateLimit = parsed;
      }
    }

    if (scheduleType === "DAILY" || scheduleType === "WEEKLY") {
      body.scheduleHour = Number(scheduleHour) || 0;
    }
    if (scheduleType === "EVERY_N_HOURS") {
      body.scheduleInterval = Number(scheduleInterval) || 1;
    }
    if (scheduleType === "WEEKLY") {
      body.scheduleDaysOfWeek = scheduleDaysOfWeek;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/ingestion/ingestion-jobs", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Falha ao criar job.");
        return;
      }
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    background: "#fafaf6",
    borderColor: "rgba(10,10,10,0.08)",
    color: "#2a2620",
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: backdrop precisa envolver o modal (que tem seus proprios controles), nao pode virar <button>
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="button"
      style={{
        alignItems: "flex-start",
        background: "rgba(10,10,10,0.45)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        overflowY: "auto",
        padding: "40px 16px",
        position: "fixed",
        zIndex: 60,
      }}
      tabIndex={-1}
    >
      <div
        style={{
          background: AT.card,
          borderRadius: 12,
          maxWidth: 520,
          padding: 24,
          width: "100%",
        }}
      >
        <h3 style={{ color: AT.ink, fontSize: 15, fontWeight: 600 }}>
          Criar job
        </h3>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginTop: 16,
          }}
        >
          <div>
            <label
              htmlFor="job-name"
              style={{
                color: AT.muted,
                display: "block",
                fontSize: 11.5,
                marginBottom: 4,
              }}
            >
              Nome do job
            </label>
            <input
              className="h-9 w-full rounded-md border px-3 text-[12.5px]"
              id="job-name"
              onChange={(e) => setName(e.target.value)}
              style={fieldStyle}
              value={name}
            />
          </div>

          <div>
            <p style={{ color: AT.muted, fontSize: 11.5, marginBottom: 4 }}>
              Tipo de job
            </p>
            <div style={{ display: "flex", gap: 14 }}>
              <label
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: 12.5,
                  gap: 8,
                }}
              >
                <input
                  checked={jobType === "CRAWL"}
                  name="jobType"
                  onChange={() => handleJobTypeChange("CRAWL")}
                  type="radio"
                />
                Carga de vagas
              </label>
              <label
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: 12.5,
                  gap: 8,
                }}
              >
                <input
                  checked={jobType === "LOGO_FETCH"}
                  name="jobType"
                  onChange={() => handleJobTypeChange("LOGO_FETCH")}
                  type="radio"
                />
                Carregar logo
              </label>
              <label
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: 12.5,
                  gap: 8,
                }}
              >
                <input
                  checked={jobType === "DISCOVERY_VALIDATE"}
                  name="jobType"
                  onChange={() => handleJobTypeChange("DISCOVERY_VALIDATE")}
                  type="radio"
                />
                Descoberta ATS
              </label>
            </div>
          </div>

          {jobType === "DISCOVERY_VALIDATE" && (
            <div>
              <label
                htmlFor="discovery-validate-limit"
                style={{
                  color: AT.muted,
                  display: "block",
                  fontSize: 11.5,
                  marginBottom: 4,
                }}
              >
                Quantos candidatos por execução (vazio = fila inteira)
              </label>
              <input
                className="h-9 w-full rounded-md border px-3 text-[12.5px]"
                id="discovery-validate-limit"
                min={1}
                onChange={(e) => setDiscoveryValidateLimit(e.target.value)}
                style={fieldStyle}
                type="number"
                value={discoveryValidateLimit}
              />
            </div>
          )}

          {(jobType === "CRAWL" || jobType === "LOGO_FETCH") && (
            <div>
              <p style={{ color: AT.muted, fontSize: 11.5, marginBottom: 4 }}>
                Escopo
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label
                  style={{
                    alignItems: "center",
                    display: "flex",
                    fontSize: 12.5,
                    gap: 8,
                  }}
                >
                  <input
                    checked={scopeType === "ADAPTER"}
                    name="scopeType"
                    onChange={() => setScopeType("ADAPTER")}
                    type="radio"
                  />
                  Adapter inteiro
                  {scopeType === "ADAPTER" && (
                    <select
                      className="h-8 rounded-md border px-2 text-[12.5px]"
                      onChange={(e) => setAdapterType(e.target.value)}
                      style={fieldStyle}
                      value={adapterType}
                    >
                      {jobType === "LOGO_FETCH"
                        ? LOGO_FETCH_ADAPTER_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))
                        : [
                            "gupy",
                            "custom_html",
                            "custom_api",
                            "greenhouse",
                            "lever",
                            "ashby",
                            "inhire",
                            "teamtailor",
                            "talentbrew",
                            "workday",
                            "pandape",
                          ].map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                    </select>
                  )}
                </label>
                {jobType === "CRAWL" && (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <label
                      style={{
                        alignItems: "center",
                        display: "flex",
                        fontSize: 12.5,
                        gap: 8,
                      }}
                    >
                      <input
                        checked={scopeType === "SOURCE"}
                        name="scopeType"
                        onChange={() => setScopeType("SOURCE")}
                        type="radio"
                      />
                      Fonte específica
                    </label>
                    {scopeType === "SOURCE" && (
                      <select
                        className="h-8 w-full rounded-md border px-2 text-[12.5px]"
                        onChange={(e) => setJobSourceId(e.target.value)}
                        style={{
                          ...fieldStyle,
                          marginLeft: 24,
                          maxWidth: "calc(100% - 24px)",
                          minWidth: 0,
                        }}
                        value={jobSourceId}
                      >
                        <option value="">selecione...</option>
                        {sources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <label
                  style={{
                    alignItems: "center",
                    display: "flex",
                    fontSize: 12.5,
                    gap: 8,
                  }}
                >
                  <input
                    checked={scopeType === "ALL"}
                    name="scopeType"
                    onChange={() => setScopeType("ALL")}
                    type="radio"
                  />
                  {jobType === "LOGO_FETCH"
                    ? "Todos os adapters implementados"
                    : "Todas as fontes ativas"}
                </label>
              </div>
              {jobType === "LOGO_FETCH" && (
                <label
                  style={{
                    alignItems: "center",
                    display: "flex",
                    fontSize: 12.5,
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <input
                    checked={onlyMissingLogo}
                    onChange={(event) =>
                      setOnlyMissingLogo(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Somente companies sem logo (delta) — desmarque pra reprocessar
                  mesmo as que já têm logo carregado
                </label>
              )}
            </div>
          )}

          <div>
            <p style={{ color: AT.muted, fontSize: 11.5, marginBottom: 4 }}>
              Frequência
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: 12.5,
                  gap: 8,
                }}
              >
                <input
                  checked={scheduleType === "MANUAL"}
                  name="scheduleType"
                  onChange={() => setScheduleType("MANUAL")}
                  type="radio"
                />
                Manual (só disparo manual)
              </label>
              <label
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: 12.5,
                  gap: 8,
                }}
              >
                <input
                  checked={scheduleType === "DAILY"}
                  name="scheduleType"
                  onChange={() => setScheduleType("DAILY")}
                  type="radio"
                />
                Todo dia às
                {scheduleType === "DAILY" && (
                  <>
                    <input
                      className="h-8 w-16 rounded-md border px-2 text-[12.5px]"
                      max={23}
                      min={0}
                      onChange={(e) => setScheduleHour(e.target.value)}
                      style={fieldStyle}
                      type="number"
                      value={scheduleHour}
                    />
                    :
                    <input
                      className="h-8 w-16 rounded-md border px-2 text-[12.5px]"
                      max={59}
                      min={0}
                      onChange={(e) => setScheduleMinute(e.target.value)}
                      style={fieldStyle}
                      type="number"
                      value={scheduleMinute}
                    />
                  </>
                )}
              </label>
              <label
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: 12.5,
                  gap: 8,
                }}
              >
                <input
                  checked={scheduleType === "EVERY_N_HOURS"}
                  name="scheduleType"
                  onChange={() => setScheduleType("EVERY_N_HOURS")}
                  type="radio"
                />
                <span>A cada</span>{" "}
                {scheduleType === "EVERY_N_HOURS" && (
                  <input
                    className="h-8 w-16 rounded-md border px-2 text-[12.5px]"
                    max={24}
                    min={1}
                    onChange={(e) => setScheduleInterval(e.target.value)}
                    style={fieldStyle}
                    type="number"
                    value={scheduleInterval}
                  />
                )}{" "}
                <span>horas</span>
              </label>
              <label
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: 12.5,
                  gap: 8,
                }}
              >
                <input
                  checked={scheduleType === "WEEKLY"}
                  name="scheduleType"
                  onChange={() => setScheduleType("WEEKLY")}
                  type="radio"
                />
                Toda semana às
                {scheduleType === "WEEKLY" && (
                  <>
                    <input
                      className="h-8 w-16 rounded-md border px-2 text-[12.5px]"
                      max={23}
                      min={0}
                      onChange={(e) => setScheduleHour(e.target.value)}
                      style={fieldStyle}
                      type="number"
                      value={scheduleHour}
                    />
                    :
                    <input
                      className="h-8 w-16 rounded-md border px-2 text-[12.5px]"
                      max={59}
                      min={0}
                      onChange={(e) => setScheduleMinute(e.target.value)}
                      style={fieldStyle}
                      type="number"
                      value={scheduleMinute}
                    />
                  </>
                )}
              </label>
              {scheduleType === "WEEKLY" && (
                <div style={{ display: "flex", gap: 6, paddingLeft: 24 }}>
                  {WEEKDAY_LABELS.map((label, day) => (
                    <button
                      key={label}
                      onClick={() => toggleDay(day)}
                      style={{
                        background: scheduleDaysOfWeek.includes(day)
                          ? AT.ink
                          : AT.faint,
                        border: "none",
                        borderRadius: 6,
                        color: scheduleDaysOfWeek.includes(day)
                          ? "white"
                          : AT.muted,
                        cursor: "pointer",
                        fontSize: 11,
                        padding: "4px 8px",
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p style={{ color: "#b91c1c", fontSize: 12.5 }}>{error}</p>}

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button
              className={buttonVariants({ size: "sm", variant: "outline" })}
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
            <button
              className={buttonVariants({ size: "sm" })}
              disabled={saving}
              onClick={handleSubmit}
              type="button"
            >
              {saving ? "Criando..." : "Criar job"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type GlobalSchedulerConfig = {
  enabled: boolean;
  globalCron: string | null;
  normalDelayMs: number;
  errorDelayMs: number;
  timezone: string;
};

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<GlobalSchedulerConfig | null>(null);
  const [normalDelaySeconds, setNormalDelaySeconds] = useState("45");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/ingestion/scheduler", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Falha ao carregar configurações.");
        const data: GlobalSchedulerConfig = await res.json();
        if (cancelled) return;
        setConfig(data);
        setNormalDelaySeconds(String(Math.round(data.normalDelayMs / 1000)));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao carregar configurações.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setError(null);
    const seconds = Number(normalDelaySeconds);
    if (!config || !Number.isFinite(seconds) || seconds < 1 || seconds > 600) {
      setError("Delay entre empresas deve ser entre 1 e 600 segundos.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/ingestion/scheduler", {
        body: JSON.stringify({
          enabled: config.enabled,
          errorDelayMs: config.errorDelayMs,
          globalCron: config.globalCron || undefined,
          normalDelayMs: Math.round(seconds * 1000),
          timezone: config.timezone,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Falha ao salvar configurações.");
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    background: "#fafaf6",
    borderColor: "rgba(10,10,10,0.08)",
    color: "#2a2620",
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: backdrop precisa envolver o modal (que tem seus proprios controles), nao pode virar <button>
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="button"
      style={{
        alignItems: "flex-start",
        background: "rgba(10,10,10,0.45)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        overflowY: "auto",
        padding: "40px 16px",
        position: "fixed",
        zIndex: 60,
      }}
      tabIndex={-1}
    >
      <div
        style={{
          background: AT.card,
          borderRadius: 12,
          maxWidth: 440,
          padding: 24,
          width: "100%",
        }}
      >
        <h3 style={{ color: AT.ink, fontSize: 15, fontWeight: 600 }}>
          Configurações
        </h3>

        {loading ? (
          <p style={{ color: AT.muted, fontSize: 12.5, marginTop: 16 }}>
            Carregando...
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              marginTop: 16,
            }}
          >
            <div>
              <label
                htmlFor="normal-delay-seconds"
                style={{
                  color: AT.muted,
                  display: "block",
                  fontSize: 11.5,
                  marginBottom: 4,
                }}
              >
                Delay entre empresas (segundos)
              </label>
              <input
                className="h-9 w-full rounded-md border px-3 text-[12.5px]"
                id="normal-delay-seconds"
                max={600}
                min={1}
                onChange={(e) => setNormalDelaySeconds(e.target.value)}
                style={fieldStyle}
                type="number"
                value={normalDelaySeconds}
              />
              <p style={{ color: AT.faint, fontSize: 11, marginTop: 4 }}>
                Tempo de espera entre o início de uma empresa e a próxima, por
                fonte de captura. Vale pra todos os adapters (Gupy, Greenhouse,
                Lever etc.).
              </p>
            </div>
          </div>
        )}

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 12 }}>
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className={buttonVariants({ size: "sm" })}
            disabled={loading || saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function JobsTabClient({
  sources,
  initialCreateSourceId,
  initialCreateSourceName,
}: Props) {
  const [jobs, setJobs] = useState<IngestionJobRow[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [modalOpen, setModalOpen] = useState(Boolean(initialCreateSourceId));
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);

  const [runsResult, setRunsResult] = useState<RunsResponse | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [runsPage, setRunsPage] = useState(1);
  const [runsJobFilter, setRunsJobFilter] = useState("");
  const [runsStatusFilter, setRunsStatusFilter] = useState("");
  const [runsTriggerFilter, setRunsTriggerFilter] = useState("");
  const [runsDateFrom, setRunsDateFrom] = useState("");
  const [runsDateTo, setRunsDateTo] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/admin/ingestion/ingestion-jobs", {
        cache: "no-store",
      });
      if (res.ok) setJobs(await res.json());
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const fetchRuns = useCallback(
    async (page: number) => {
      setLoadingRuns(true);
      try {
        const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
        if (runsJobFilter) qs.set("jobId", runsJobFilter);
        if (runsStatusFilter) qs.set("status", runsStatusFilter);
        if (runsTriggerFilter) qs.set("triggeredBy", runsTriggerFilter);
        if (runsDateFrom) qs.set("dateFrom", `${runsDateFrom}T00:00:00.000Z`);
        // Fim do dia (23:59:59.999) — senao "ate 15/08" excluiria as
        // execucoes do proprio dia 15 (a data pura vira meia-noite UTC).
        if (runsDateTo) qs.set("dateTo", `${runsDateTo}T23:59:59.999Z`);
        const res = await fetch(
          `/api/admin/ingestion/ingestion-jobs/runs?${qs}`,
          {
            cache: "no-store",
          },
        );
        if (res.ok) setRunsResult(await res.json());
      } finally {
        setLoadingRuns(false);
      }
    },
    [
      runsJobFilter,
      runsStatusFilter,
      runsTriggerFilter,
      runsDateFrom,
      runsDateTo,
    ],
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    fetchRuns(runsPage);
  }, [runsPage, fetchRuns]);

  async function handleToggle(id: string) {
    setPendingJobId(id);
    try {
      await fetch(`/api/admin/ingestion/ingestion-jobs/${id}/toggle`, {
        method: "POST",
      });
      await fetchJobs();
    } finally {
      setPendingJobId(null);
    }
  }

  async function handleRunNow(id: string) {
    setPendingJobId(id);
    try {
      await fetch(`/api/admin/ingestion/ingestion-jobs/${id}/run-now`, {
        method: "POST",
      });
      await fetchJobs();
      await fetchRuns(runsPage);
    } finally {
      setPendingJobId(null);
    }
  }

  function handleShowLogs(id: string) {
    setRunsJobFilter(id);
    setRunsPage(1);
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir o job "${name}"? Essa ação não pode ser desfeita.`)) {
      return;
    }
    setPendingJobId(id);
    try {
      await fetch(`/api/admin/ingestion/ingestion-jobs/${id}`, {
        method: "DELETE",
      });
      await fetchJobs();
    } finally {
      setPendingJobId(null);
    }
  }

  const total = runsResult?.total ?? 0;
  const pageSize = runsResult?.pageSize ?? 20;
  const totalRunsPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ color: AT.ink, fontSize: 15, fontWeight: 600 }}>Jobs</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={buttonVariants({ size: "sm", variant: "outline" })}
              disabled={loadingJobs}
              onClick={() => fetchJobs()}
              type="button"
            >
              {loadingJobs ? "Atualizando..." : "Atualizar"}
            </button>
            <button
              className={buttonVariants({ size: "sm", variant: "outline" })}
              onClick={() => setSettingsModalOpen(true)}
              type="button"
            >
              Configurações
            </button>
            <button
              className={buttonVariants({ size: "sm" })}
              onClick={() => setModalOpen(true)}
              type="button"
            >
              + Criar job
            </button>
          </div>
        </div>

        <AdminTable>
          <thead>
            <tr>
              <AdminTh>Nome</AdminTh>
              <AdminTh w={220}>Escopo</AdminTh>
              <AdminTh w={200}>Frequência</AdminTh>
              <AdminTh w={140}>Próxima execução</AdminTh>
              <AdminTh w={90}>Status</AdminTh>
              <AdminTh w={340} align="right">
                Ações
              </AdminTh>
            </tr>
          </thead>
          <tbody>
            {!loadingJobs && jobs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    color: AT.muted,
                    padding: "32px 16px",
                    textAlign: "center",
                  }}
                >
                  Nenhum job cadastrado.
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id}>
                <AdminTd>{job.name}</AdminTd>
                <AdminTd muted>{scopeLabel(job)}</AdminTd>
                <AdminTd muted>{frequencyLabel(job)}</AdminTd>
                <AdminTd mono muted>
                  {formatDateTime(job.nextRunAt)}
                </AdminTd>
                <AdminTd>
                  <AdminPill mono tone={job.isEnabled ? "ok" : "neutral"}>
                    {job.isEnabled ? "ativo" : "inativo"}
                  </AdminPill>
                </AdminTd>
                <AdminTd align="right">
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      disabled={pendingJobId === job.id}
                      onClick={() => handleToggle(job.id)}
                      style={{ whiteSpace: "nowrap" }}
                      type="button"
                    >
                      {job.isEnabled ? "Pausar" : "Ativar"}
                    </button>
                    <button
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      disabled={pendingJobId === job.id}
                      onClick={() => handleRunNow(job.id)}
                      style={{ whiteSpace: "nowrap" }}
                      type="button"
                    >
                      Rodar agora
                    </button>
                    <button
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      onClick={() => handleShowLogs(job.id)}
                      style={{ whiteSpace: "nowrap" }}
                      type="button"
                    >
                      Logs
                    </button>
                    <button
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      disabled={pendingJobId === job.id}
                      onClick={() => handleDelete(job.id, job.name)}
                      style={{ whiteSpace: "nowrap" }}
                      type="button"
                    >
                      Excluir
                    </button>
                  </div>
                </AdminTd>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </div>

      <div
        ref={historyRef}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ color: AT.ink, fontSize: 15, fontWeight: 600 }}>
            Histórico de execuções
          </h2>
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            disabled={loadingRuns}
            onClick={() => fetchRuns(runsPage)}
            type="button"
          >
            {loadingRuns ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <select
            className="h-9 rounded-md border px-3 text-[12.5px]"
            onChange={(e) => {
              setRunsJobFilter(e.target.value);
              setRunsPage(1);
            }}
            style={{
              background: AT.card,
              borderColor: AT.border,
              color: AT.ink2,
            }}
            value={runsJobFilter}
          >
            <option value="">Todos os jobs</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border px-3 text-[12.5px]"
            onChange={(e) => {
              setRunsStatusFilter(e.target.value);
              setRunsPage(1);
            }}
            style={{
              background: AT.card,
              borderColor: AT.border,
              color: AT.ink2,
            }}
            value={runsStatusFilter}
          >
            <option value="">Todos os status</option>
            <option value="QUEUED">QUEUED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <select
            className="h-9 rounded-md border px-3 text-[12.5px]"
            onChange={(e) => {
              setRunsTriggerFilter(e.target.value);
              setRunsPage(1);
            }}
            style={{
              background: AT.card,
              borderColor: AT.border,
              color: AT.ink2,
            }}
            value={runsTriggerFilter}
          >
            <option value="">Todos os disparos</option>
            <option value="SCHEDULE">schedule</option>
            <option value="MANUAL">manual</option>
          </select>
          <input
            aria-label="Data inicial"
            className="h-9 rounded-md border px-3 text-[12.5px]"
            onChange={(e) => {
              setRunsDateFrom(e.target.value);
              setRunsPage(1);
            }}
            style={{
              background: AT.card,
              borderColor: AT.border,
              color: AT.ink2,
            }}
            type="date"
            value={runsDateFrom}
          />
          <input
            aria-label="Data final"
            className="h-9 rounded-md border px-3 text-[12.5px]"
            onChange={(e) => {
              setRunsDateTo(e.target.value);
              setRunsPage(1);
            }}
            style={{
              background: AT.card,
              borderColor: AT.border,
              color: AT.ink2,
            }}
            type="date"
            value={runsDateTo}
          />
        </div>

        <AdminTable>
          <thead>
            <tr>
              <AdminTh>Job</AdminTh>
              <AdminTh w={90}>Tipo</AdminTh>
              <AdminTh w={100}>Disparo</AdminTh>
              <AdminTh w={140}>Início</AdminTh>
              <AdminTh w={140}>Fim</AdminTh>
              <AdminTh w={100}>Status</AdminTh>
              <AdminTh>Resumo</AdminTh>
              <AdminTh w={90} align="right">
                Detalhe
              </AdminTh>
            </tr>
          </thead>
          <tbody>
            {(runsResult?.runs.length ?? 0) === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    color: AT.muted,
                    padding: "32px 16px",
                    textAlign: "center",
                  }}
                >
                  Nenhuma execução registrada.
                </td>
              </tr>
            )}
            {runsResult?.runs.map((run) => (
              <tr key={run.id}>
                <AdminTd>
                  {run.job?.name ?? run.jobName}
                  {!run.job ? (
                    <span
                      style={{
                        color: AT.muted,
                        fontSize: 10.5,
                        marginLeft: 6,
                      }}
                      title="O job que gerou essa execução foi excluído — nome preservado do momento da execução."
                    >
                      (excluído)
                    </span>
                  ) : null}
                </AdminTd>
                <AdminTd mono muted>
                  {run.job?.jobType ?? run.jobType}
                </AdminTd>
                <AdminTd mono muted>
                  {run.triggeredBy === "SCHEDULE" ? "schedule" : "manual"}
                </AdminTd>
                <AdminTd mono muted>
                  {formatDateTime(run.startedAt)}
                </AdminTd>
                <AdminTd mono muted>
                  {formatDateTime(run.finishedAt)}
                </AdminTd>
                <AdminTd>
                  <AdminPill mono tone={RUN_STATUS_TONE[run.status]}>
                    {run.status}
                  </AdminPill>
                </AdminTd>
                <AdminTd muted>
                  {run.batchRun
                    ? `${run.batchRun.succeededCount}/${run.batchRun.totalSources} ok, ${run.batchRun.failedCount} falhas`
                    : (run.errorMessage ?? "—")}
                </AdminTd>
                <AdminTd align="right">
                  {run.batchRunId ? (
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={`/admin/ingestion/manual/${run.batchRunId}`}
                    >
                      Ver
                    </Link>
                  ) : (
                    "—"
                  )}
                </AdminTd>
              </tr>
            ))}
          </tbody>
        </AdminTable>

        <AdminPagination
          summary={`página ${runsPage} de ${totalRunsPages} · ${total} execuções`}
        >
          {runsPage > 1 && (
            <button
              className={buttonVariants({ size: "sm", variant: "outline" })}
              onClick={() => setRunsPage((p) => p - 1)}
              type="button"
            >
              ← anterior
            </button>
          )}
          {runsPage < totalRunsPages && (
            <button
              className={buttonVariants({ size: "sm", variant: "outline" })}
              onClick={() => setRunsPage((p) => p + 1)}
              type="button"
            >
              próxima →
            </button>
          )}
        </AdminPagination>
      </div>

      {modalOpen && (
        <CreateJobModal
          initialSourceId={initialCreateSourceId}
          initialSourceLabel={initialCreateSourceName}
          onClose={() => setModalOpen(false)}
          onCreated={fetchJobs}
          sources={sources}
        />
      )}

      {settingsModalOpen && (
        <SettingsModal onClose={() => setSettingsModalOpen(false)} />
      )}
    </div>
  );
}
