"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import type {
  CompanySourceAuditApplySummary,
  CompanySourceAuditCounts,
  CompanySourceAuditFinding,
  CompanySourceAuditStatus,
  CompanySourceAuditTier,
} from "@/lib/admin-ingestion-api";
import { DuplicateSourcesPanel } from "./duplicate-sources-panel";

const TIER_LABEL: Record<CompanySourceAuditTier, string> = {
  confirmed: "Confirmado",
  high: "Alta confiança",
  review: "Revisão manual",
};

const TIER_TONE: Record<CompanySourceAuditTier, "danger" | "warn" | "neutral"> =
  {
    confirmed: "danger",
    high: "warn",
    review: "neutral",
  };

const STATUS_LABEL: Record<CompanySourceAuditStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  applied: "Aplicado",
};

const STATUS_TONE: Record<
  CompanySourceAuditStatus,
  "warn" | "ok" | "neutral" | "info"
> = {
  pending: "warn",
  approved: "ok",
  rejected: "neutral",
  applied: "info",
};

function fieldLabel(field: CompanySourceAuditFinding["field"]) {
  if (field === "careersUrl") return "URL de carreiras";
  if (field === "websiteUrl") return "Site";
  return "Fonte (JobSource)";
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AuditTabClient() {
  const [statusFilter, setStatusFilter] = useState<
    CompanySourceAuditStatus | ""
  >("pending");
  const [tierFilter, setTierFilter] = useState<CompanySourceAuditTier | "">("");
  const [search, setSearch] = useState("");
  const [findings, setFindings] = useState<CompanySourceAuditFinding[] | null>(
    null,
  );
  const [counts, setCounts] = useState<CompanySourceAuditCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runPending, setRunPending] = useState(false);
  const [decidePendingId, setDecidePendingId] = useState<string | null>(null);
  const [applyPending, setApplyPending] = useState(false);
  const [applyResult, setApplyResult] =
    useState<CompanySourceAuditApplySummary | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (params: {
      status: CompanySourceAuditStatus | "";
      tier: CompanySourceAuditTier | "";
      search: string;
    }) => {
      try {
        const qs = new URLSearchParams();
        if (params.status) qs.set("status", params.status);
        if (params.tier) qs.set("tier", params.tier);
        if (params.search) qs.set("search", params.search);
        const res = await fetch(
          `/api/admin/ingestion/company-source-audit?${qs}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Falha ao carregar a fila de auditoria.");
        const data = await res.json();
        setFindings(data.findings);
        setCounts(data.counts);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Falha ao carregar a fila de auditoria.",
        );
      }
    },
    [],
  );

  useEffect(() => {
    load({ status: statusFilter, tier: tierFilter, search });
  }, [statusFilter, tierFilter, search, load]);

  function handleSearchChange(value: string) {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(value), 300);
  }

  async function handleRun() {
    setRunPending(true);
    try {
      const res = await fetch("/api/admin/ingestion/company-source-audit/run", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error ?? "Falha ao rodar a auditoria.");
        return;
      }
      window.alert(
        `Auditoria concluída: ${data.found} achado(s) — ${data.created} novo(s), ${data.updated} atualizado(s), ${data.skippedReviewed} já revisado(s) mantido(s).`,
      );
      await load({ status: statusFilter, tier: tierFilter, search });
    } finally {
      setRunPending(false);
    }
  }

  async function handleDecide(id: string, status: "approved" | "rejected") {
    setDecidePendingId(id);
    try {
      const res = await fetch(
        `/api/admin/ingestion/company-source-audit/${id}/decide`,
        {
          body: JSON.stringify({ status }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        window.alert(data?.error ?? "Falha ao atualizar o achado.");
        return;
      }
      await load({ status: statusFilter, tier: tierFilter, search });
    } finally {
      setDecidePendingId(null);
    }
  }

  async function handleApply(dryRun: boolean) {
    if (
      !dryRun &&
      !window.confirm(
        "Aplicar TODAS as linhas aprovadas agora? Isso desativa fontes erradas, limpa campos de empresa e marca/reatribui vagas já importadas. Não pode ser desfeito.",
      )
    ) {
      return;
    }
    setApplyPending(true);
    try {
      const res = await fetch(
        "/api/admin/ingestion/company-source-audit/apply",
        {
          body: JSON.stringify({ dryRun }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = await res.json();
      if (!res.ok) {
        window.alert(data?.error ?? "Falha ao aplicar a auditoria.");
        return;
      }
      setApplyResult(data);
      await load({ status: statusFilter, tier: tierFilter, search });
    } finally {
      setApplyPending(false);
    }
  }

  const approvedCount = counts?.approved ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <p style={{ color: AT.muted, fontSize: 12.5, maxWidth: 720 }}>
          Compara o nome de cada empresa com o domínio/URL das fontes de
          carreiras cadastradas — sinaliza quando não bate (ex: uma empresa com
          a URL de outra). Heurístico determinístico, sem IA. Revise cada achado
          e aprove/rejeite antes de aplicar qualquer correção.
        </p>
      </div>

      {error && <p style={{ color: AT.danger, fontSize: 12.5 }}>{error}</p>}

      {/* Contadores + Rodar auditoria */}
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
          {(["pending", "approved", "rejected", "applied"] as const).map(
            (status) => (
              <AdminPill key={status} tone={STATUS_TONE[status]} mono>
                {STATUS_LABEL[status]}: {counts?.[status] ?? 0}
              </AdminPill>
            ),
          )}
        </div>
        <button
          className={buttonVariants({ size: "sm" })}
          disabled={runPending}
          onClick={handleRun}
          type="button"
        >
          {runPending ? "Rodando auditoria..." : "Rodar auditoria"}
        </button>
      </div>

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
          placeholder="Buscar empresa, URL ou dono suspeito"
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{
            height: 32,
            borderRadius: 6,
            border: `1px solid ${AT.border}`,
            background: AT.card,
            color: AT.ink2,
            padding: "0 10px",
            fontSize: 12.5,
            flex: "1 1 220px",
            minWidth: 180,
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as CompanySourceAuditStatus | "")
          }
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
          <option value="pending">Pendente</option>
          <option value="approved">Aprovado</option>
          <option value="rejected">Rejeitado</option>
          <option value="applied">Aplicado</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) =>
            setTierFilter(e.target.value as CompanySourceAuditTier | "")
          }
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
          <option value="">Todos os tiers</option>
          <option value="confirmed">Confirmado</option>
          <option value="high">Alta confiança</option>
          <option value="review">Revisão manual</option>
        </select>
      </div>

      {/* Aplicar aprovadas */}
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
          {approvedCount} linha(s) aprovada(s) prontas pra aplicar.
        </span>
        <button
          className={buttonVariants({ variant: "outline", size: "sm" })}
          disabled={applyPending || approvedCount === 0}
          onClick={() => handleApply(true)}
          type="button"
        >
          Simular (dry-run)
        </button>
        <button
          className={buttonVariants({ size: "sm" })}
          disabled={applyPending || approvedCount === 0}
          onClick={() => handleApply(false)}
          type="button"
        >
          {applyPending ? "Aplicando..." : "Aplicar aprovadas"}
        </button>
        {applyResult && (
          <span
            style={{
              fontSize: 12,
              color: AT.muted,
              fontFamily: '"Geist Mono", monospace',
            }}
          >
            {applyResult.dryRun ? "[dry-run] " : ""}
            {applyResult.processed} processada(s) ·{" "}
            {applyResult.jobSourcesDisabled} fonte(s) desativada(s) ·{" "}
            {applyResult.jobSourcesCreated} fonte(s) nova(s) ·{" "}
            {applyResult.companiesCreated} empresa(s) rascunho ·{" "}
            {applyResult.companyFieldsCleared} campo(s) limpo(s) ·{" "}
            {applyResult.jobsReassigned} vaga(s) reatribuída(s) ·{" "}
            {applyResult.jobsRemoved} vaga(s) removida(s)
          </span>
        )}
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Empresa</AdminTh>
            <AdminTh w={130}>Campo</AdminTh>
            <AdminTh>URL atual</AdminTh>
            <AdminTh w={130}>Tier</AdminTh>
            <AdminTh w={70} align="right">
              Confiança
            </AdminTh>
            <AdminTh>Dono suspeito</AdminTh>
            <AdminTh w={100}>Status</AdminTh>
            <AdminTh w={110}>Detectado em</AdminTh>
            <AdminTh w={190} align="right">
              Ações
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {findings && findings.length === 0 && (
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
                Nenhum achado com esses filtros.
              </td>
            </tr>
          )}
          {findings === null && (
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
                Carregando...
              </td>
            </tr>
          )}
          {findings?.map((finding) => (
            <tr key={finding.id}>
              <AdminTd>{finding.company.name}</AdminTd>
              <AdminTd muted>{fieldLabel(finding.field)}</AdminTd>
              <AdminTd mono muted>
                <span style={{ wordBreak: "break-all" }}>
                  {finding.currentUrl}
                </span>
              </AdminTd>
              <AdminTd>
                <AdminPill tone={TIER_TONE[finding.tier]}>
                  {TIER_LABEL[finding.tier]}
                </AdminPill>
              </AdminTd>
              <AdminTd mono align="right">
                {finding.confidence.toFixed(2)}
              </AdminTd>
              <AdminTd muted>
                {finding.suspectedOwner?.name ??
                  finding.suspectedOwnerName ??
                  "—"}
              </AdminTd>
              <AdminTd>
                <AdminPill tone={STATUS_TONE[finding.status]}>
                  {STATUS_LABEL[finding.status]}
                </AdminPill>
              </AdminTd>
              <AdminTd mono muted>
                {dateLabel(finding.detectedAt)}
              </AdminTd>
              <AdminTd align="right">
                {finding.status === "pending" ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      disabled={decidePendingId === finding.id}
                      onClick={() => handleDecide(finding.id, "approved")}
                      type="button"
                    >
                      Aprovar
                    </button>
                    <button
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      disabled={decidePendingId === finding.id}
                      onClick={() => handleDecide(finding.id, "rejected")}
                      type="button"
                    >
                      Rejeitar
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: 11.5, color: AT.muted }}>
                    {dateLabel(finding.reviewedAt ?? finding.appliedAt)}
                  </span>
                )}
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      <div>
        <button
          className={buttonVariants({
            variant: showDuplicates ? "default" : "outline",
            size: "sm",
          })}
          onClick={() => setShowDuplicates((v) => !v)}
          type="button"
        >
          {showDuplicates
            ? "Ocultar fontes duplicadas"
            : "Ver fontes duplicadas"}
        </button>
      </div>
      {showDuplicates && <DuplicateSourcesPanel />}
    </div>
  );
}
