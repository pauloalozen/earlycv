"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import type {
  GoogleIndexingBackfillStatus,
  GoogleIndexingJobStatus,
  GoogleIndexingJobsPage,
  GoogleIndexingQueueStatus,
} from "@/lib/admin-ingestion-api";

const STAT_ITEMS: Array<{
  key: keyof GoogleIndexingBackfillStatus;
  label: string;
}> = [
  { key: "totalEligible", label: "Elegíveis" },
  { key: "notified", label: "Notificadas" },
  { key: "pending", label: "Pendentes (passivo)" },
  { key: "notifiedToday", label: "Enviadas hoje" },
  { key: "dailyLimit", label: "Cota diária" },
  { key: "estimatedDaysRemaining", label: "Dias restantes (estimado)" },
];

function queueStatItems(queue: GoogleIndexingQueueStatus) {
  return [
    { label: "Na fila: remoção", value: queue.pending.deleted },
    { label: "Na fila: publicação", value: queue.pending.updated },
    { label: "Enviadas hoje", value: queue.sentToday },
    ...(queue.sentTodayByType
      ? [
          {
            label: "Hoje: publicação",
            value: queue.sentTodayByType.updated,
          },
          {
            label: `Hoje: remoção (piso ${queue.deletedDailyFloor ?? 60})`,
            value: queue.sentTodayByType.deleted,
          },
        ]
      : []),
    { label: "Cota restante hoje", value: queue.remainingToday },
    { label: "Falhas (5 tentativas)", value: queue.failed },
  ];
}

const STAT_LABEL_STYLE = {
  color: AT.muted2,
  fontFamily: '"Geist Mono", monospace',
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: 1.1,
  textTransform: "uppercase" as const,
};

const STAT_VALUE_STYLE = {
  color: AT.ink2,
  fontSize: 26,
  fontWeight: 500,
  letterSpacing: -1,
  marginTop: 4,
};

const STATUS_LABELS: Record<
  GoogleIndexingJobStatus,
  { label: string; tone: "warn" | "ok" | "danger" }
> = {
  pending: { label: "Pendente", tone: "warn" },
  notified: { label: "Notificada", tone: "ok" },
  failed: { label: "Falhou", tone: "danger" },
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

const PAGE_SIZE = 20;

export function IndexacaoTabClient() {
  const [status, setStatus] = useState<GoogleIndexingBackfillStatus | null>(
    null,
  );
  const [queue, setQueue] = useState<GoogleIndexingQueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] =
    useState<GoogleIndexingJobStatus>("pending");
  const [page, setPage] = useState(1);
  const [jobsPage, setJobsPage] = useState<GoogleIndexingJobsPage | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/admin/ingestion/google-indexing/backfill-status",
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("failed to fetch status");
      setStatus(await res.json());
      const queueRes = await fetch(
        "/api/admin/ingestion/google-indexing/queue-status",
        { cache: "no-store" },
      );
      if (!queueRes.ok) throw new Error("failed to fetch queue status");
      setQueue(await queueRes.json());
      setError(null);
    } catch {
      setError("Não foi possível carregar o status da indexação.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const qs = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(
        `/api/admin/ingestion/google-indexing/jobs?${qs}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("failed to fetch jobs");
      setJobsPage(await res.json());
    } catch {
      setJobsPage(null);
    } finally {
      setJobsLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  function handleStatusFilterChange(next: GoogleIndexingJobStatus) {
    setStatusFilter(next);
    setPage(1);
  }

  async function handleRunNow() {
    if (!status?.ingestionJobId) return;
    setRunning(true);
    try {
      await fetch(
        `/api/admin/ingestion/ingestion-jobs/${status.ingestionJobId}/run-now`,
        { method: "POST" },
      );
      await Promise.all([fetchStatus(), fetchJobs()]);
    } finally {
      setRunning(false);
    }
  }

  const totalPages = jobsPage
    ? Math.max(1, Math.ceil(jobsPage.total / jobsPage.pageSize))
    : 1;

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
          O backfill enfileira as vagas ativas com enriquecimento concluído
          ainda não notificadas. Roda sozinho todo dia às 3h; o botão abaixo
          enfileira um lote agora. O envio para a Google Indexing API é feito
          pela fila, a cada minuto, com remoções antes de publicações e
          respeitando a cota diária (janela do horário do Pacífico).
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
            gridTemplateColumns: "repeat(6, 1fr)",
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

      {!loading && queue && (
        <div style={{ display: "grid", gap: 8 }}>
          {!queue.enabled && (
            <p style={{ color: AT.danger, fontSize: 13 }}>
              GOOGLE_INDEXING_ENABLED desligado: a fila continua recebendo
              pendências, mas nada é enviado.
            </p>
          )}
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(5, 1fr)",
            }}
          >
            {queueStatItems(queue).map((item) => (
              <div key={item.label}>
                <div style={STAT_LABEL_STYLE}>{item.label}</div>
                <div style={STAT_VALUE_STYLE}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ color: AT.muted, fontSize: 12 }}>
        Histórico de execuções (agendadas e manuais) fica na aba{" "}
        <strong>Jobs</strong>, job “Indexação de vagas (Google)”.
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        {(Object.keys(STATUS_LABELS) as GoogleIndexingJobStatus[]).map(
          (option) => (
            <button
              className={buttonVariants({
                size: "sm",
                variant: statusFilter === option ? "default" : "outline",
              })}
              key={option}
              onClick={() => handleStatusFilterChange(option)}
              type="button"
            >
              {STATUS_LABELS[option].label}
            </button>
          ),
        )}
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Vaga</AdminTh>
            <AdminTh>Empresa</AdminTh>
            <AdminTh w={90}>Status</AdminTh>
            <AdminTh w={150}>Última tentativa</AdminTh>
            <AdminTh>Erro</AdminTh>
          </tr>
        </thead>
        <tbody>
          {!jobsLoading && (!jobsPage || jobsPage.jobs.length === 0) && (
            <tr>
              <td
                colSpan={5}
                style={{
                  color: AT.muted,
                  padding: "32px 16px",
                  textAlign: "center",
                }}
              >
                Nenhuma vaga nesse status.
              </td>
            </tr>
          )}
          {jobsPage?.jobs.map((job) => (
            <tr key={job.id}>
              <AdminTd>{job.title}</AdminTd>
              <AdminTd muted>{job.companyName}</AdminTd>
              <AdminTd>
                <AdminPill tone={STATUS_LABELS[statusFilter].tone} mono>
                  {STATUS_LABELS[statusFilter].label}
                </AdminPill>
              </AdminTd>
              <AdminTd mono muted>
                {formatDateTime(job.lastAttemptAt)}
              </AdminTd>
              <AdminTd muted>{job.lastError ?? "—"}</AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      {jobsPage && (
        <AdminPagination
          summary={`página ${page} de ${totalPages} · ${jobsPage.total} vagas`}
        >
          {page > 1 && (
            <button
              className={buttonVariants({ size: "sm", variant: "outline" })}
              onClick={() => setPage((p) => p - 1)}
              type="button"
            >
              ← anterior
            </button>
          )}
          {page < totalPages && (
            <button
              className={buttonVariants({ size: "sm", variant: "outline" })}
              onClick={() => setPage((p) => p + 1)}
              type="button"
            >
              próxima →
            </button>
          )}
        </AdminPagination>
      )}
    </div>
  );
}
