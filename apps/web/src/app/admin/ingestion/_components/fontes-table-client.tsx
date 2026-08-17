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
import {
  bulkToggleActiveAction,
  bulkToggleScheduleEnabledAction,
  deleteJobSourceAction,
  importCompanySourcesCsvAction,
  runJobSourceAction,
  toggleScheduleEnabledAction,
} from "../actions";
import { DuplicateSourcesPanel } from "./duplicate-sources-panel";

type IngestionRunSummary = {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
};

type JobSourceRow = {
  activeJobsCount: number;
  company: { id: string; logoUrl: string | null; name: string };
  consecutive403Count?: number;
  createdAt: string;
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
  initialTypeFilter?: string;
};

type SortBy =
  | "sourceName"
  | "company"
  | "sourceType"
  | "activeJobsCount"
  | "createdAt";
type SortDir = "asc" | "desc";

const SORT_STORAGE_KEY = "admin-ingestion-fontes-sort";

function readStoredSort(): { sortBy: SortBy; sortDir: SortDir } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.sortBy === "string" &&
      typeof parsed.sortDir === "string"
    ) {
      return parsed as { sortBy: SortBy; sortDir: SortDir };
    }
  } catch {
    // ignore malformed/unavailable storage
  }
  return null;
}

function writeStoredSort(sortBy: SortBy | null, sortDir: SortDir) {
  if (typeof window === "undefined") return;
  try {
    if (sortBy === null) {
      window.sessionStorage.removeItem(SORT_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      SORT_STORAGE_KEY,
      JSON.stringify({ sortBy, sortDir }),
    );
  } catch {
    // ignore malformed/unavailable storage
  }
}

function elapsedLabel(startedAt: string) {
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function SortableTh({
  align,
  children,
  column,
  onSort,
  sortBy,
  sortDir,
  w,
}: {
  align?: "left" | "right" | "center";
  children: React.ReactNode;
  column: SortBy;
  onSort: (column: SortBy) => void;
  sortBy: SortBy | null;
  sortDir: SortDir;
  w?: number | string;
}) {
  const active = sortBy === column;
  return (
    <AdminTh align={align} w={w}>
      <button
        type="button"
        onClick={() => onSort(column)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          color: active ? AT.ink2 : "inherit",
          cursor: "pointer",
        }}
      >
        {children}
        <span style={{ opacity: active ? 1 : 0.35 }}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </AdminTh>
  );
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
        <AdminPill tone="warn">
          rodando há {elapsedLabel(run.startedAt)}
        </AdminPill>
      </span>
    );
  }
  if (run.status === "completed")
    return <AdminPill tone="ok">concluído</AdminPill>;
  return <AdminPill tone="danger">falhou</AdminPill>;
}

// Menu "⋯" com as ações menos usadas (Criar job, Excluir) — mantém a linha
// de ações principal (Carregar vagas / Carregar logo / Editar) cabendo numa
// linha só. Estado de aberto é local a cada linha; fecha ao clicar fora ou
// em Escape.
function RowActionsMenu({
  sourceId,
  companyName,
  sourceName,
  activeJobsCount,
  redirectPath,
}: {
  sourceId: string;
  companyName: string;
  sourceName: string;
  activeJobsCount: number;
  redirectPath: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const removeJobsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        aria-expanded={open}
        aria-label="Mais ações"
        className={buttonVariants({ size: "sm", variant: "outline" })}
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: 10, paddingRight: 10 }}
        type="button"
      >
        ⋯
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 20,
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px -8px rgba(10,10,10,0.25)",
            display: "flex",
            flexDirection: "column",
            minWidth: 140,
            overflow: "hidden",
          }}
        >
          <Link
            href={`/admin/ingestion?tab=jobs&createSourceId=${sourceId}&createSourceName=${encodeURIComponent(`${companyName} · ${sourceName}`)}`}
            onClick={() => setOpen(false)}
            style={{
              padding: "8px 12px",
              fontSize: 12.5,
              color: AT.ink2,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Criar job
          </Link>
          <form
            action={deleteJobSourceAction}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Excluir a fonte "${sourceName}" (${companyName})? Essa acao nao pode ser desfeita.`,
                )
              ) {
                e.preventDefault();
                return;
              }
              // Pergunta separada da confirmação de exclusão — excluir a
              // fonte nunca apaga a vaga junto por padrão (Job.jobSourceId
              // é nullable), só se o usuário pedir explicitamente aqui.
              const removeJobs =
                activeJobsCount > 0 &&
                confirm(
                  `Também remover ${activeJobsCount === 1 ? "a vaga" : `as ${activeJobsCount} vagas`} associada(s) a essa fonte? OK = remove as vagas, Cancelar = mantém as vagas (só desvincula da fonte).`,
                );
              if (removeJobsInputRef.current) {
                removeJobsInputRef.current.value = removeJobs
                  ? "true"
                  : "false";
              }
              setOpen(false);
            }}
          >
            <input name="jobSourceId" type="hidden" value={sourceId} />
            <input name="redirectPath" type="hidden" value={redirectPath} />
            <input
              name="removeJobs"
              ref={removeJobsInputRef}
              type="hidden"
              value="false"
            />
            <button
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 12.5,
                color: AT.danger,
                background: "none",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              type="submit"
            >
              Excluir
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function FontesTableClient({ initialData, initialTypeFilter }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState(initialTypeFilter ?? "");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [result, setResult] = useState<PagedResult>(initialData);
  const [togglePending, setTogglePending] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [logoFetchPendingId, setLogoFetchPendingId] = useState<string | null>(
    null,
  );

  const isFirstRender = useRef(true);
  const paramsRef = useRef({
    search: "",
    statusFilter: "",
    typeFilter: initialTypeFilter ?? "",
    page: 1,
    sortBy: null as SortBy | null,
    sortDir: "asc" as SortDir,
  });
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSources = useCallback(
    async (params: {
      search: string;
      statusFilter: string;
      typeFilter: string;
      page: number;
      sortBy: SortBy | null;
      sortDir: SortDir;
    }) => {
      try {
        const qs = new URLSearchParams({
          page: String(params.page),
          pageSize: "50",
        });
        if (params.search) qs.set("search", params.search);
        if (params.statusFilter) qs.set("statusFilter", params.statusFilter);
        if (params.typeFilter) qs.set("typeFilter", params.typeFilter);
        if (params.sortBy) {
          qs.set("sortBy", params.sortBy);
          qs.set("sortDir", params.sortDir);
        }
        const res = await fetch(`/api/admin/ingestion/sources?${qs}`, {
          cache: "no-store",
        });
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
    paramsRef.current = {
      search,
      statusFilter,
      typeFilter,
      page,
      sortBy,
      sortDir,
    };
    fetchSources({ search, statusFilter, typeFilter, page, sortBy, sortDir });
  }, [search, statusFilter, typeFilter, page, sortBy, sortDir, fetchSources]);

  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchSources(paramsRef.current);
    }, 5_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchSources]);

  // Restores the sort the admin picked before a full-page action (rodar,
  // excluir, editar) redirected them back here — otherwise every such
  // action silently reset the table back to its default order. Runs after
  // the effect above so isFirstRender is already false, letting the state
  // change here actually trigger a fetch with the restored sort.
  useEffect(() => {
    const stored = readStoredSort();
    if (stored) {
      setSortBy(stored.sortBy);
      setSortDir(stored.sortDir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handleBulkToggle(nextEnabled: boolean) {
    if (!typeFilter) return;
    const verb = nextEnabled ? "ativar" : "desativar";
    const confirmed = window.confirm(
      `Isso vai ${verb} o agendamento de ${total} fonte(s) do adapter "${typeFilter}". Confirma?`,
    );
    if (!confirmed) return;

    setBulkPending(true);
    try {
      const fd = new FormData();
      fd.set("sourceType", typeFilter);
      fd.set("scheduleEnabled", String(nextEnabled));
      fd.set("redirectPath", redirectPath);
      const response = await bulkToggleScheduleEnabledAction(fd);
      if (response) {
        window.alert(
          `Agendamento ${nextEnabled ? "ativado" : "desativado"} em ${response.count} fonte(s) do adapter "${typeFilter}".`,
        );
      }
      await fetchSources(paramsRef.current);
    } finally {
      setBulkPending(false);
    }
  }

  async function handleBulkToggleActive(nextActive: boolean) {
    if (!typeFilter) return;
    const verb = nextActive ? "ativar" : "desativar";
    const confirmed = window.confirm(
      `Isso vai ${verb} ${total} fonte(s) do adapter "${typeFilter}". Confirma?`,
    );
    if (!confirmed) return;

    setBulkPending(true);
    try {
      const fd = new FormData();
      fd.set("sourceType", typeFilter);
      fd.set("isActive", String(nextActive));
      fd.set("redirectPath", redirectPath);
      const response = await bulkToggleActiveAction(fd);
      if (response) {
        window.alert(
          `${response.count} fonte(s) do adapter "${typeFilter}" ${nextActive ? "ativada(s)" : "desativada(s)"}.`,
        );
      }
      await fetchSources(paramsRef.current);
    } finally {
      setBulkPending(false);
    }
  }

  // Busca síncrona por empresa (POST /companies/:id/fetch-logo, via proxy) —
  // disparo em lote (todos os adapters implementados, ou um específico)
  // fica no popup "Criar job" da aba Jobs (jobType LOGO_FETCH).
  async function handleFetchLogo(companyId: string) {
    setLogoFetchPendingId(companyId);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/fetch-logo`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        window.alert(data?.error ?? "Falha ao buscar logo.");
        return;
      }
      if (data?.status === "completed") {
        await fetchSources(paramsRef.current);
      } else if (data?.status === "skipped") {
        window.alert(
          data.reason ?? "Nenhuma fonte suportada para essa empresa.",
        );
      } else {
        window.alert(data?.errorSummary ?? "Logo não encontrado.");
      }
    } finally {
      setLogoFetchPendingId(null);
    }
  }

  function handleSort(column: SortBy) {
    const nextDir = sortBy === column && sortDir === "asc" ? "desc" : "asc";
    setSortDir(nextDir);
    setSortBy(column);
    setPage(1);
    writeStoredSort(column, nextDir);
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
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
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
          <option value="aguardando primeiro run">
            aguardando primeiro run
          </option>
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
          <option value="greenhouse">greenhouse</option>
          <option value="lever">lever</option>
          <option value="ashby">ashby</option>
          <option value="inhire">inhire</option>
          <option value="teamtailor">teamtailor</option>
          <option value="talentbrew">talentbrew</option>
          <option value="workday">workday</option>
          <option value="solides">solides</option>
          <option value="pandape">pandape</option>
        </select>
        {typeFilter && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => handleBulkToggle(true)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ativar agendamento ({typeFilter})
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => handleBulkToggle(false)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Desativar agendamento ({typeFilter})
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => handleBulkToggleActive(true)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ativar fontes ({typeFilter})
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => handleBulkToggleActive(false)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Desativar fontes ({typeFilter})
            </button>
          </div>
        )}
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
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href="/api/admin/ingestion/companies-csv"
            download
          >
            Baixar modelo CSV
          </a>
          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href="/api/admin/ingestion/job-sources/export-csv"
            download
          >
            Exportar fontes (CSV)
          </a>
          <button
            className={buttonVariants({
              variant: showDuplicates ? "default" : "outline",
              size: "sm",
            })}
            onClick={() => setShowDuplicates((v) => !v)}
            type="button"
          >
            {showDuplicates ? "Voltar pra tabela" : "Ver fontes duplicadas"}
          </button>
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
              style={{
                borderColor: AT.border,
                background: AT.card,
                color: AT.ink2,
              }}
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

      {showDuplicates && <DuplicateSourcesPanel />}

      {!showDuplicates && (
        <>
          <AdminTable>
            <thead>
              <tr>
                <SortableTh
                  column="company"
                  onSort={handleSort}
                  sortBy={sortBy}
                  sortDir={sortDir}
                >
                  Empresa
                </SortableTh>
                <SortableTh
                  column="sourceName"
                  onSort={handleSort}
                  sortBy={sortBy}
                  sortDir={sortDir}
                >
                  Fonte
                </SortableTh>
                <SortableTh
                  column="sourceType"
                  onSort={handleSort}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  w={110}
                >
                  Adapter
                </SortableTh>
                <SortableTh
                  column="activeJobsCount"
                  onSort={handleSort}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  w={70}
                >
                  Vagas
                </SortableTh>
                <SortableTh
                  column="createdAt"
                  onSort={handleSort}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  w={110}
                >
                  Incluída em
                </SortableTh>
                <AdminTh w={180}>Status</AdminTh>
                <AdminTh w={140}>Agendamento</AdminTh>
                <AdminTh w={160}>Último run</AdminTh>
                <AdminTh w={340} align="right">
                  Ações
                </AdminTh>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
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
                      (
                        e.currentTarget as HTMLTableRowElement
                      ).style.background = AT.bgAlt;
                    }}
                    onMouseLeave={(e) => {
                      (
                        e.currentTarget as HTMLTableRowElement
                      ).style.background = "";
                    }}
                  >
                    <AdminTd>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {source.company.logoUrl ? (
                          // biome-ignore lint/performance/noImgElement: logo de domínio externo, sem otimização do next/image
                          <img
                            alt=""
                            src={source.company.logoUrl}
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 5,
                              objectFit: "contain",
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            aria-hidden
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 5,
                              background: AT.ink,
                              color: AT.card,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 700,
                              fontFamily: '"Geist Mono", monospace',
                              flexShrink: 0,
                            }}
                          >
                            {source.company.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {source.company.name}
                      </div>
                    </AdminTd>
                    <AdminTd muted>{source.sourceName}</AdminTd>
                    <AdminTd mono muted>
                      {source.sourceType}
                    </AdminTd>
                    <AdminTd mono>
                      <span
                        style={{
                          color:
                            source.activeJobsCount === 0 ? AT.muted : AT.ink2,
                        }}
                      >
                        {source.activeJobsCount}
                      </span>
                    </AdminTd>
                    <AdminTd mono muted>
                      {dateLabel(source.createdAt)}
                    </AdminTd>
                    <AdminTd>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        {source.consecutive403Count &&
                        source.consecutive403Count > 0 ? (
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
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
                            background: source.scheduleEnabled
                              ? AT.ok
                              : AT.faint,
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
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "nowrap",
                          gap: 6,
                          justifyContent: "flex-end",
                        }}
                      >
                        <form action={runJobSourceAction}>
                          <input
                            name="jobSourceId"
                            type="hidden"
                            value={source.id}
                          />
                          <input
                            name="redirectPath"
                            type="hidden"
                            value={redirectPath}
                          />
                          <button
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                            type="submit"
                            disabled={isRunning}
                            title={isRunning ? "Em execução" : undefined}
                            style={{
                              whiteSpace: "nowrap",
                              ...(isRunning
                                ? { opacity: 0.45, cursor: "not-allowed" }
                                : undefined),
                            }}
                          >
                            Carregar vagas
                          </button>
                        </form>
                        <button
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          disabled={logoFetchPendingId === source.company.id}
                          onClick={() => handleFetchLogo(source.company.id)}
                          style={{ whiteSpace: "nowrap" }}
                          type="button"
                        >
                          {logoFetchPendingId === source.company.id
                            ? "Carregando..."
                            : "Carregar logo"}
                        </button>
                        <Link
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          href={`/admin/ingestion/${source.id}#editar-fonte`}
                          style={{ whiteSpace: "nowrap" }}
                        >
                          Editar
                        </Link>
                        <RowActionsMenu
                          activeJobsCount={source.activeJobsCount}
                          companyName={source.company.name}
                          redirectPath={redirectPath}
                          sourceId={source.id}
                          sourceName={source.sourceName}
                        />
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
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
