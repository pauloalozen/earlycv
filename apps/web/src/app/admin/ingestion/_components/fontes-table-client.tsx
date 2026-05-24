"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AT,
  AdminFilterBar,
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/app/admin/_components/admin-primitives";
import {
  deleteJobSourceAction,
  importCompanySourcesCsvAction,
  runJobSourceAction,
  toggleScheduleEnabledAction,
} from "../actions";

type IngestionRunSummary = {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
};

type JobSourceRow = {
  id: string;
  sourceName: string;
  sourceType: string;
  company: { name: string };
  scheduleEnabled?: boolean;
  scheduleCron?: string | null;
  consecutive403Count?: number;
  pausedUntil?: string | null;
  ingestionRuns?: IngestionRunSummary[];
};

type Props = {
  initialSources: JobSourceRow[];
  // pagination
  page: number;
  totalPages: number;
  buildHref: (p: number) => string;
  // filters
  query?: string;
  sourceStatus?: string;
  type?: string;
};

function elapsedLabel(startedAt: string) {
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function RunStatusBadge({ run }: { run?: IngestionRunSummary | null }) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (run?.status !== "running") return;
    const id = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [run]);

  if (!run) return <AdminPill tone="neutral">sem execuções</AdminPill>;
  if (run.status === "running") {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: AT.warn,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
        <AdminPill tone="warn">rodando há {elapsedLabel(run.startedAt)}</AdminPill>
      </span>
    );
  }
  if (run.status === "completed")
    return <AdminPill tone="ok">concluído</AdminPill>;
  return <AdminPill tone="danger">falhou</AdminPill>;
}

export function FontesTableClient({
  initialSources,
  page,
  totalPages,
  buildHref,
  query,
  sourceStatus,
  type,
}: Props) {
  const [sources, setSources] = useState<JobSourceRow[]>(initialSources);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [togglePending, startToggleTransition] = useTransition();

  async function pollSources() {
    try {
      const res = await fetch("/api/admin/ingestion/sources");
      if (!res.ok) return;
      const fresh: JobSourceRow[] = await res.json();
      setSources(fresh);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    setSources(initialSources);
  }, [initialSources]);

  useEffect(() => {
    pollingRef.current = setInterval(pollSources, 5_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const redirectPath = "/admin/ingestion?tab=fontes";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* CSV import no topo */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: AT.muted,
            fontFamily: '"Geist Mono", monospace',
          }}
        >
          Importar por CSV:
        </span>
        <form action={importCompanySourcesCsvAction} className="flex gap-2">
          <input name="redirectPath" type="hidden" value={redirectPath} />
          <input
            className="h-8 rounded-md border px-2 text-xs"
            style={{ borderColor: AT.border, background: AT.card, color: AT.ink2 }}
            accept=".csv"
            name="file"
            required
            type="file"
          />
          <button
            className={buttonVariants({ variant: "outline", size: "sm" })}
            name="dryRun"
            type="submit"
            value="true"
          >
            Validar (dry-run)
          </button>
          <button
            className={buttonVariants({ size: "sm" })}
            name="dryRun"
            type="submit"
            value="false"
          >
            Importar
          </button>
        </form>
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Empresa</AdminTh>
            <AdminTh>Fonte</AdminTh>
            <AdminTh w={110}>Adapter</AdminTh>
            <AdminTh w={180}>Status</AdminTh>
            <AdminTh w={140}>Agendamento</AdminTh>
            <AdminTh w={160}>Último run</AdminTh>
            <AdminTh w={200} align="right">
              Ações
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {sources.length === 0 && (
            <tr>
              <td
                colSpan={7}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: AT.muted,
                  fontSize: 13,
                }}
              >
                Nenhuma fonte encontrada.
              </td>
            </tr>
          )}
          {sources.map((source) => {
            const latestRun = source.ingestionRuns?.[0] ?? null;
            const isRunning = latestRun?.status === "running";
            return (
              <tr
                key={source.id}
                style={{
                  borderBottom: `1px solid ${AT.borderSoft}`,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    AT.bgAlt;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    "";
                }}
              >
                <AdminTd>{source.company.name}</AdminTd>
                <AdminTd muted>{source.sourceName}</AdminTd>
                <AdminTd mono muted>
                  {source.sourceType}
                </AdminTd>
                <AdminTd>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {source.consecutive403Count && source.consecutive403Count > 0 ? (
                      <AdminPill tone="warn" mono>
                        {source.consecutive403Count} 403s
                      </AdminPill>
                    ) : null}
                    {source.pausedUntil ? (
                      <AdminPill tone="danger" mono>
                        pausado
                      </AdminPill>
                    ) : null}
                  </div>
                </AdminTd>
                <AdminTd>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      title={
                        source.scheduleEnabled
                          ? "Desativar agendamento"
                          : "Ativar agendamento"
                      }
                      disabled={togglePending}
                      onClick={() => {
                        startToggleTransition(async () => {
                          const fd = new FormData();
                          fd.set("jobSourceId", source.id);
                          fd.set(
                            "scheduleEnabled",
                            source.scheduleEnabled ? "false" : "true",
                          );
                          fd.set("redirectPath", redirectPath);
                          await toggleScheduleEnabledAction(fd);
                          await pollSources();
                        });
                      }}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        border: "none",
                        background: source.scheduleEnabled ? AT.ok : AT.faint,
                        cursor: togglePending ? "not-allowed" : "pointer",
                        position: "relative",
                        transition: "background 0.2s",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          left: source.scheduleEnabled ? 18 : 2,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "white",
                          transition: "left 0.2s",
                        }}
                      />
                    </button>
                    <span
                      style={{ fontSize: 11.5, color: AT.muted, fontFamily: '"Geist Mono", monospace' }}
                    >
                      {source.scheduleCron ?? "—"}
                    </span>
                  </div>
                </AdminTd>
                <AdminTd>
                  <RunStatusBadge run={latestRun} />
                </AdminTd>
                <AdminTd align="right">
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <form action={runJobSourceAction}>
                      <input name="jobSourceId" type="hidden" value={source.id} />
                      <input name="redirectPath" type="hidden" value={redirectPath} />
                      <button
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                        type="submit"
                        disabled={isRunning}
                        title={isRunning ? "Em execução" : undefined}
                        style={isRunning ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                      >
                        Rodar
                      </button>
                    </form>
                    <Link
                      className={buttonVariants({ size: "sm", variant: "outline" })}
                      href={`/admin/ingestion/${source.id}`}
                    >
                      Detalhe
                    </Link>
                    <form action={deleteJobSourceAction}>
                      <input name="jobSourceId" type="hidden" value={source.id} />
                      <input name="redirectPath" type="hidden" value={redirectPath} />
                      <button
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                        type="submit"
                      >
                        Excluir
                      </button>
                    </form>
                  </div>
                </AdminTd>
              </tr>
            );
          })}
        </tbody>
      </AdminTable>

      <AdminPagination
        summary={`página ${page} de ${totalPages}`}
      >
        {page > 1 && (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={buildHref(page - 1)}
          >
            ← anterior
          </Link>
        )}
        {page < totalPages && (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={buildHref(page + 1)}
          >
            próxima →
          </Link>
        )}
      </AdminPagination>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
