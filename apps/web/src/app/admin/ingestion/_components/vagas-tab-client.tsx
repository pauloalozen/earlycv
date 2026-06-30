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

type JobRow = {
  id: string;
  title: string;
  companyId: string;
  jobSourceId: string;
  locationText: string;
  status: string;
  canonicalKey: string;
};

type JobsResponse = {
  jobs: JobRow[];
  total: number;
  page: number;
  pageSize: number;
};

type SourceName = string;

type Props = {
  availableSourceNames: SourceName[];
  initialVagaQuery?: string;
  initialVagaSource?: string;
  initialVagaStatus?: string;
  initialPage?: number;
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function VagasTabClient({
  availableSourceNames,
  initialVagaQuery = "",
  initialVagaSource = "",
  initialVagaStatus = "",
  initialPage = 1,
}: Props) {
  const [search, setSearch] = useState(initialVagaQuery);
  const [sourceFilter, setSourceFilter] = useState(initialVagaSource);
  const [statusFilter, setStatusFilter] = useState(initialVagaStatus);
  const [page, setPage] = useState(initialPage);
  const [result, setResult] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const debouncedSearch = useDebounce(search, 300);

  const fetchJobs = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: "20" });
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (sourceFilter) params.set("sourceFilter", sourceFilter);
        if (statusFilter) params.set("statusFilter", statusFilter);
        const res = await fetch(`/api/admin/ingestion/jobs?${params}`);
        if (res.ok) setResult(await res.json());
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, sourceFilter, statusFilter],
  );

  useEffect(() => {
    setPage(1);
    fetchJobs(1);
  }, [fetchJobs]);

  useEffect(() => {
    fetchJobs(page);
  }, [page, fetchJobs]);

  const total = result?.total ?? 0;
  const pageSize = result?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
            minWidth: 220,
          }}
          placeholder="Buscar por título, empresa ou local"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
          }}
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="">Todas as fontes</option>
          {availableSourceNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
          }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="removed">removed</option>
        </select>
      </div>

      {/* Contador */}
      <div
        style={{
          fontSize: 12,
          color: AT.muted,
          fontFamily: '"Geist Mono", monospace',
        }}
      >
        {loading
          ? "Carregando..."
          : total === 0
            ? "Nenhuma vaga encontrada."
            : `Mostrando ${start}–${end} de ${total}`}
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Título</AdminTh>
            <AdminTh w={220}>Empresa / Fonte</AdminTh>
            <AdminTh w={160}>Localização</AdminTh>
            <AdminTh w={100}>Status</AdminTh>
            <AdminTh w={180}>Chave</AdminTh>
          </tr>
        </thead>
        <tbody>
          {!loading && (!result || result.jobs.length === 0) && (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: AT.muted,
                  fontSize: 13,
                }}
              >
                Nenhuma vaga encontrada.
              </td>
            </tr>
          )}
          {result?.jobs.map((job) => (
            <tr key={job.id}>
              <AdminTd>{job.title}</AdminTd>
              <AdminTd muted>{job.companyId}</AdminTd>
              <AdminTd muted>{job.locationText || "—"}</AdminTd>
              <AdminTd>
                <AdminPill
                  tone={
                    job.status === "active"
                      ? "ok"
                      : job.status === "inactive"
                        ? "neutral"
                        : "danger"
                  }
                  mono
                >
                  {job.status}
                </AdminPill>
              </AdminTd>
              <AdminTd mono muted>
                {job.canonicalKey}
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      <AdminPagination
        summary={`página ${page} de ${totalPages} · ${total} vagas`}
      >
        {page > 1 && (
          <button
            type="button"
            className={buttonVariants({ size: "sm", variant: "outline" })}
            onClick={() => setPage((p) => p - 1)}
          >
            ← anterior
          </button>
        )}
        {page < totalPages && (
          <button
            type="button"
            className={buttonVariants({ size: "sm", variant: "outline" })}
            onClick={() => setPage((p) => p + 1)}
          >
            próxima →
          </button>
        )}
      </AdminPagination>
    </div>
  );
}
