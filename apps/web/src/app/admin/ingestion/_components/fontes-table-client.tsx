"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AT,
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
  activeJobsCount: number;
  company: { name: string };
  consecutive403Count?: number;
  id: string;
  ingestionRuns?: IngestionRunSummary[];
  pausedUntil?: string | null;
  scheduleCron?: string | null;
  scheduleEnabled?: boolean;
  sourceName: string;
  sourceType: string;
};

type PagedResult = {
  page: number;
  pageSize: number;
  rows: JobSourceRow[];
  total: number;
  totalPages: number;
};

type Props = {
  initialData: PagedResult;
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
  if (run.status === "completed") return <AdminPill tone="ok">concluído</AdminPill>;
  return <AdminPill tone="danger">falhou</AdminPill>;
}

export function FontesTableClient({ initialData }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PagedResult>(initialData);
  const [togglePending, setTogglePending] = useState(false);

  const isFirstRender = useRef(true);
  const paramsRef = useRef({ search: "", statusFilter: "", typeFilter: "", page: 1 });
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSources = useCallback(
    async (params: {
      search: string;
      statusFilter: string;
      typeFilter: string;
      page: number;
    }) => {
      try {
        const qs = new URLSearchParams({ page: String(params.page), pageSize: "50" });
        if (params.search) qs.set("search", params.search);
        if (params.statusFilter) qs.set("statusFilter", params.statusFilter);
        if (params.typeFilter) qs.set("typeFilter", params.typeFilter);
        const res = await fetch(`/api/admin/ingestion/sources?${qs}`);
        if (!res.ok) return;
        const data: PagedResult = await res.json();
        setResult(data);
      } catch {
        // ignore
      }
    },
    [],
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    paramsRef.current = { search, statusFilter, typeFilter, page };
    fetchSources({ search, statusFilter, typeFilter, page });
  }, [search, statusFilter, typeFilter, page, fetchSources]);

  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchSources(paramsRef.current);
    }, 5_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchSources]);

  function handleSearchChange(value: string) {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  function handleTypeFilterChange(value: string) {
    setTypeFilter(value);
    setPage(1);
  }

  const rows = result.rows;
  const total = result.total;
  const totalPages = result.totalPages;
  const currentPage = result.page;
  const pageSize = result.pageSize;

  const firstItem = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, total);

  const redirectPath = "/admin/ingestion?tab=fontes";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar fonte ou empresa"
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{
            height: 32,
            borderRadius: 6,
            border: `1px solid ${AT.border}`,
            background: AT.card,
            color: AT.ink2,
            padding: "0 10px",
            fontSize: 12.5,
            flex: "1 1 200px",
            minWidth: 160,
          }}
        />
        <select
          defaultValue=""
          onChange={(e) => handleStatusFilterChange(e.target.value)}
          style={{
            height: 32,
            borderRadius: 6,
            border: `1px solid ${AT.border}`,
            background: AT.card,
            color: AT.ink2,
            padding: "0 10px",
            fontSize: 12.5,
          }}
        >
          <option value="">Todos os status</option>
          <option value="aguardando primeiro run">aguardando primeiro run</option>
          <option value="falha recente">falha recente</option>
          <option value="ativa">ativa</option>
        </select>
        <select
          defaultValue=""
          onChange={(e) => handleTypeFilterChange(e.target.value)}
          style={{
            height: 32,
            borderRadius: 6,
            border: `1px solid ${AT.border}`,
            background: AT.card,
            color: AT.ink2,
            padding: "0 10px",
            fontSize: 12.5,
          }}
        >
          <option value="">Todos os tipos</option>
          <option value="custom_html">custom_html</option>
          <option value="custom_api">custom_api</option>
          <option value="gupy">gupy</option>
        </select>
      </div>

      {/* Counter + CSV import */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: AT.muted,
            fontFamily: '"Geist Mono", monospace',
          }}
        >
          Mostrando {firstItem}–{lastItem} de {total}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Empresa</AdminTh>
            <AdminTh>Fonte</AdminTh>
            <AdminTh w={110}>Adapter</AdminTh>
            <AdminTh w={70}>Vagas</AdminTh>
            <AdminTh w={180}>Status</AdminTh>
            <AdminTh w={140}>Agendamento</AdminTh>
            <AdminTh w={160}>Último run</AdminTh>
            <AdminTh w={200} align="right">
              Ações
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={8}
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
          {rows.map((source) => {
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
                  (e.currentTarget as HTMLTableRowElement).style.background = AT.bgAlt;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = "";
                }}
              >
                <AdminTd>{source.company.name}</AdminTd>
                <AdminTd muted>{source.sourceName}</AdminTd>
                <AdminTd mono muted>
                  {source.sourceType}
                </AdminTd>
                <AdminTd mono>
                  <span
                    style={{
                      color: source.activeJobsCount === 0 ? AT.muted : AT.ink2,
                    }}
                  >
                    {source.activeJobsCount}
                  </span>
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
                        setTogglePending(true);
                        const fd = new FormData();
                        fd.set("jobSourceId", source.id);
                        fd.set(
                          "scheduleEnabled",
                          source.scheduleEnabled ? "false" : "true",
                        );
                        fd.set("redirectPath", redirectPath);
                        toggleScheduleEnabledAction(fd)
                          .then(() => fetchSources(paramsRef.current))
                          .finally(() => setTogglePending(false));
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
                      style={{
                        fontSize: 11.5,
                        color: AT.muted,
                        fontFamily: '"Geist Mono", monospace',
                      }}
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
                        style={
                          isRunning ? { opacity: 0.45, cursor: "not-allowed" } : undefined
                        }
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
        summary={`Mostrando ${firstItem}–${lastItem} de ${total} · página ${currentPage} de ${totalPages}`}
      >
        {currentPage > 1 && (
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            type="button"
            onClick={() => setPage((p) => p - 1)}
          >
            ← anterior
          </button>
        )}
        {currentPage < totalPages && (
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            type="button"
            onClick={() => setPage((p) => p + 1)}
          >
            próxima →
          </button>
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
