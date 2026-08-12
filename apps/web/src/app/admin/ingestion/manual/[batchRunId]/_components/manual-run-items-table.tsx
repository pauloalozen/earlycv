"use client";

import { useMemo, useState } from "react";
import {
  AdminPagination,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import type {
  ManualRunItemRecord,
  ManualRunItemStatus,
} from "@/lib/admin-ingestion-api";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 50;

const STATUS_OPTIONS: { value: ManualRunItemStatus | ""; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "queued", label: "queued" },
  { value: "running", label: "running" },
  { value: "completed", label: "completed" },
  { value: "failed", label: "failed" },
  { value: "skipped", label: "skipped" },
  { value: "cancelled", label: "cancelled" },
];

export function ManualRunItemsTable({
  items,
}: {
  items: ManualRunItemRecord[];
}) {
  const [statusFilter, setStatusFilter] = useState<ManualRunItemStatus | "">(
    "",
  );
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      statusFilter
        ? items.filter((item) => item.status === statusFilter)
        : items,
    [items, statusFilter],
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const firstItem = total === 0 ? 0 : start + 1;
  const lastItem = Math.min(start + PAGE_SIZE, total);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ManualRunItemStatus | "");
            setPage(1);
          }}
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
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          style={{
            fontSize: 12,
            color: AT.muted,
            fontFamily: '"Geist Mono", monospace',
          }}
        >
          Mostrando {firstItem}–{lastItem} de {total}
        </span>
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Empresa</AdminTh>
            <AdminTh>Fonte</AdminTh>
            <AdminTh>Adapter</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Início</AdminTh>
            <AdminTh>Fim</AdminTh>
            <AdminTh>Vagas lidas</AdminTh>
            <AdminTh>Erro</AdminTh>
          </tr>
        </thead>
        <tbody>
          {pageItems.length === 0 ? (
            <tr>
              <AdminTd muted>Nenhum item para esse filtro.</AdminTd>
            </tr>
          ) : (
            pageItems.map((item) => {
              const run = item.ingestionRun;
              const jobsRead = run
                ? run.newCount +
                  run.updatedCount +
                  run.skippedCount +
                  run.failedCount
                : null;

              return (
                <tr key={item.id}>
                  <AdminTd>{item.companyName}</AdminTd>
                  <AdminTd>{item.sourceName}</AdminTd>
                  <AdminTd mono>{item.sourceType}</AdminTd>
                  <AdminTd>{item.status}</AdminTd>
                  <AdminTd mono muted>
                    {item.startedAt
                      ? new Date(item.startedAt).toLocaleString("pt-BR")
                      : "—"}
                  </AdminTd>
                  <AdminTd mono muted>
                    {item.finishedAt
                      ? new Date(item.finishedAt).toLocaleString("pt-BR")
                      : "—"}
                  </AdminTd>
                  <AdminTd mono>
                    {jobsRead === null
                      ? "—"
                      : `${jobsRead} (novas ${run?.newCount} / atualizadas ${run?.updatedCount} / falhas ${run?.failedCount})`}
                  </AdminTd>
                  <AdminTd muted>{item.errorMessage ?? "—"}</AdminTd>
                </tr>
              );
            })
          )}
        </tbody>
      </AdminTable>

      {totalPages > 1 && (
        <AdminPagination
          summary={`Página ${currentPage} de ${totalPages}`}
        >
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              currentPage <= 1 && "opacity-50",
            )}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              currentPage >= totalPages && "opacity-50",
            )}
          >
            Próxima
          </button>
        </AdminPagination>
      )}
    </div>
  );
}
