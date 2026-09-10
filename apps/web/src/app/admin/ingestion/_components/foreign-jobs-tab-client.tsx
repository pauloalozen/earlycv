"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import type {
  ForeignJobCleanupFinding,
  ForeignJobsCleanupApplySummary,
} from "@/lib/admin-ingestion-api";

type Rows = {
  checked: number;
  foreign: ForeignJobCleanupFinding[];
  ambiguous: ForeignJobCleanupFinding[];
};

function FindingRow({
  finding,
  ambiguous,
}: {
  finding: ForeignJobCleanupFinding;
  ambiguous: boolean;
}) {
  return (
    <tr>
      <AdminTd>{finding.companyName}</AdminTd>
      <AdminTd muted>{finding.title}</AdminTd>
      <AdminTd mono muted>
        {finding.country ?? "—"}
      </AdminTd>
      <AdminTd mono muted>
        {finding.state ?? "—"}
      </AdminTd>
      <AdminTd mono muted>
        <span style={{ wordBreak: "break-all" }}>
          {finding.sourceUrl ?? "sem fonte"}
        </span>
      </AdminTd>
      <AdminTd>
        <AdminPill tone={ambiguous ? "warn" : "danger"}>
          {ambiguous ? "Ambíguo" : "Estrangeira"}
        </AdminPill>
      </AdminTd>
    </tr>
  );
}

export function ForeignJobsTabClient() {
  const [rows, setRows] = useState<Rows | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadPending, setLoadPending] = useState(false);
  const [applyPending, setApplyPending] = useState(false);
  const [applyResult, setApplyResult] =
    useState<ForeignJobsCleanupApplySummary | null>(null);
  const [filter, setFilter] = useState<"foreign" | "ambiguous">("foreign");

  const load = useCallback(async () => {
    setLoadPending(true);
    try {
      const res = await fetch(
        "/api/admin/ingestion/foreign-jobs-cleanup/preview",
        {
          cache: "no-store",
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao carregar.");
      setRows(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar preview.",
      );
    } finally {
      setLoadPending(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApply() {
    if (
      !window.confirm(
        `Fechar (status=removed) ${rows?.foreign.length ?? 0} vaga(s) estrangeira(s) agora? Isso não pode ser desfeito. As ${rows?.ambiguous.length ?? 0} ambígua(s) NÃO serão tocadas.`,
      )
    ) {
      return;
    }
    setApplyPending(true);
    try {
      const res = await fetch(
        "/api/admin/ingestion/foreign-jobs-cleanup/apply",
        {
          body: JSON.stringify({ dryRun: false }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error ?? "Falha ao aplicar.");
        return;
      }
      setApplyResult(data);
      await load();
    } finally {
      setApplyPending(false);
    }
  }

  const visibleRows = rows ? rows[filter] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ color: AT.muted, fontSize: 12.5, maxWidth: 720 }}>
        Roda o mesmo critério de geolocalização já usado na ingestão
        (isForeignLocation) contra toda vaga já publicada — pega vaga
        estrangeira que entrou antes do filtro existir, ou por bug nele (ex:
        board global de empresa com operação BR que também lista vaga de fora).
        "Ambíguo" = sigla de 2 letras isolada no campo país que colide com UF
        brasileira (ex: "SP", "MG") — pode ser vaga BR real com bug de parsing
        na fonte, não é removido automaticamente.
      </p>

      {error && <p style={{ color: AT.danger, fontSize: 12.5 }}>{error}</p>}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <AdminPill tone="danger" mono>
            Estrangeiras: {rows?.foreign.length ?? 0}
          </AdminPill>
          <AdminPill tone="warn" mono>
            Ambíguas: {rows?.ambiguous.length ?? 0}
          </AdminPill>
          <AdminPill tone="neutral" mono>
            Verificadas: {rows?.checked ?? 0}
          </AdminPill>
        </div>
        <button
          className={buttonVariants({ size: "sm", variant: "outline" })}
          disabled={loadPending}
          onClick={load}
          type="button"
        >
          {loadPending ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 12px",
          border: `1px solid ${AT.border}`,
          borderRadius: 8,
          background: AT.bgAlt,
        }}
      >
        <span style={{ fontSize: 12.5, color: AT.ink2 }}>
          Fecha só as vagas "Estrangeiras" — as "Ambíguas" ficam pra revisão
          manual.
        </span>
        <button
          className={buttonVariants({ size: "sm" })}
          disabled={applyPending || !rows || rows.foreign.length === 0}
          onClick={handleApply}
          type="button"
        >
          {applyPending
            ? "Aplicando..."
            : `Fechar ${rows?.foreign.length ?? 0} vaga(s) estrangeira(s)`}
        </button>
        {applyResult && (
          <span
            style={{
              fontSize: 12,
              color: AT.muted,
              fontFamily: '"Geist Mono", monospace',
            }}
          >
            {applyResult.removed} fechada(s) · {applyResult.skippedAmbiguous}{" "}
            ambígua(s) não tocada(s)
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className={buttonVariants({
            variant: filter === "foreign" ? "default" : "outline",
            size: "sm",
          })}
          onClick={() => setFilter("foreign")}
          type="button"
        >
          Estrangeiras ({rows?.foreign.length ?? 0})
        </button>
        <button
          className={buttonVariants({
            variant: filter === "ambiguous" ? "default" : "outline",
            size: "sm",
          })}
          onClick={() => setFilter("ambiguous")}
          type="button"
        >
          Ambíguas ({rows?.ambiguous.length ?? 0})
        </button>
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Empresa</AdminTh>
            <AdminTh>Título</AdminTh>
            <AdminTh w={100}>País</AdminTh>
            <AdminTh w={140}>Estado</AdminTh>
            <AdminTh>Fonte</AdminTh>
            <AdminTh w={110}>Tipo</AdminTh>
          </tr>
        </thead>
        <tbody>
          {visibleRows && visibleRows.length === 0 && (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: AT.muted,
                  fontSize: 13,
                }}
              >
                Nenhum achado nesse filtro.
              </td>
            </tr>
          )}
          {visibleRows === null && (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: AT.muted,
                  fontSize: 13,
                }}
              >
                Carregando...
              </td>
            </tr>
          )}
          {visibleRows?.map((finding) => (
            <FindingRow
              key={finding.jobId}
              finding={finding}
              ambiguous={filter === "ambiguous"}
            />
          ))}
        </tbody>
      </AdminTable>
    </div>
  );
}
