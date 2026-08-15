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

type DiscoveredCompanyStatus =
  | "PENDING"
  | "VALIDATED"
  | "NO_ACTIVE_JOBS"
  | "INVALID"
  | "IMPORTED"
  | "DISMISSED";

type DiscoveredCompanyRow = {
  id: string;
  name: string;
  careersUrl: string | null;
  adapterType: string | null;
  status: DiscoveredCompanyStatus;
  jobCount: number;
  errorMessage: string | null;
  createdAt: string;
};

type ValidateReport = {
  checkedCount: number;
  validatedCount: number;
  noActiveJobsCount: number;
  invalidCount: number;
  stillPendingCount: number;
};

const QUEUE_STATUSES: DiscoveredCompanyStatus[] = [
  "PENDING",
  "VALIDATED",
  "NO_ACTIVE_JOBS",
];
const HISTORY_STATUSES: DiscoveredCompanyStatus[] = [
  "IMPORTED",
  "INVALID",
  "DISMISSED",
];

const STATUS_LABELS: Record<DiscoveredCompanyStatus, string> = {
  DISMISSED: "Descartada",
  IMPORTED: "Importada",
  INVALID: "Inválida",
  NO_ACTIVE_JOBS: "Sem vagas",
  PENDING: "Pendente",
  VALIDATED: "Validada",
};

const STATUS_TONE: Record<
  DiscoveredCompanyStatus,
  "neutral" | "warn" | "ok" | "danger"
> = {
  DISMISSED: "neutral",
  IMPORTED: "ok",
  INVALID: "danger",
  NO_ACTIVE_JOBS: "warn",
  PENDING: "neutral",
  VALIDATED: "ok",
};

export function DiscoveryTabClient() {
  const [rows, setRows] = useState<DiscoveredCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"fila" | "historico">("fila");
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statuses = view === "fila" ? QUEUE_STATUSES : HISTORY_STATUSES;

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/ingestion/discovery?status=${statuses.join(",")}`,
        { cache: "no-store" },
      );
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [statuses]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  async function handleImport() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/ingestion/discovery/import", {
        body: formData,
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Falha ao importar candidatos.");
        return;
      }
      setMessage(
        `${data.createdCount} candidato(s) novo(s), ${data.skippedCount} já conhecido(s), ${data.errorCount} erro(s).`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchRows();
    } finally {
      setImporting(false);
    }
  }

  async function handleValidate() {
    setValidating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ingestion/discovery/validate", {
        method: "POST",
      });
      const data: ValidateReport = await res.json();
      if (!res.ok) {
        setError("Falha ao validar candidatos.");
        return;
      }
      setMessage(
        `${data.checkedCount} verificado(s): ${data.validatedCount} validada(s), ${data.noActiveJobsCount} sem vagas, ${data.invalidCount} inválida(s), ${data.stillPendingCount} ainda pendente(s).`,
      );
      await fetchRows();
    } finally {
      setValidating(false);
    }
  }

  async function handlePromote(id: string) {
    setPendingActionId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingestion/discovery/${id}/promote`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Falha ao criar fonte.");
        return;
      }
      await fetchRows();
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDismiss(id: string) {
    setPendingActionId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingestion/discovery/${id}/dismiss`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Falha ao descartar candidato.");
        return;
      }
      await fetchRows();
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 8,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ color: AT.ink, fontSize: 15, fontWeight: 600 }}>
          Descoberta de Empresas
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            accept=".csv"
            className="text-[12.5px]"
            ref={fileInputRef}
            type="file"
          />
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            disabled={importing}
            onClick={handleImport}
            type="button"
          >
            {importing ? "Importando..." : "Importar candidatos (CSV)"}
          </button>
          <button
            className={buttonVariants({ size: "sm" })}
            disabled={validating}
            onClick={handleValidate}
            type="button"
          >
            {validating ? "Validando..." : "Validar pendentes"}
          </button>
        </div>
      </div>

      <p style={{ color: AT.muted, fontSize: 12 }}>
        Aceita CSV só com "nome" (uma empresa por linha, testa contra todos os
        adapters que a gente tem: gupy, greenhouse, lever, ashby, inhire,
        teamtailor) ou o formato completo
        "nome,setor,site_url,careers_url,tipo_adapter" quando a URL já é
        conhecida.
      </p>

      {message && <p style={{ color: AT.ok, fontSize: 12.5 }}>{message}</p>}
      {error && <p style={{ color: "#b91c1c", fontSize: 12.5 }}>{error}</p>}

      <div style={{ display: "inline-flex", gap: 2 }}>
        <button
          className={buttonVariants({
            size: "sm",
            variant: view === "fila" ? "default" : "outline",
          })}
          onClick={() => setView("fila")}
          type="button"
        >
          Fila
        </button>
        <button
          className={buttonVariants({
            size: "sm",
            variant: view === "historico" ? "default" : "outline",
          })}
          onClick={() => setView("historico")}
          type="button"
        >
          Histórico
        </button>
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Nome</AdminTh>
            <AdminTh w={110}>Adapter</AdminTh>
            <AdminTh>URL</AdminTh>
            <AdminTh w={110}>Status</AdminTh>
            <AdminTh w={90} align="right">
              Vagas
            </AdminTh>
            <AdminTh w={160} align="right">
              Ação
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <AdminTd muted>Carregando...</AdminTd>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <AdminTd muted>Nenhum candidato nessa visão.</AdminTd>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <AdminTd>
                  <div>{row.name}</div>
                  {row.errorMessage && (
                    <div
                      style={{
                        color: AT.muted,
                        fontSize: 10.5,
                        marginTop: 2,
                        maxWidth: 320,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={row.errorMessage}
                    >
                      {row.errorMessage}
                    </div>
                  )}
                </AdminTd>
                <AdminTd mono>{row.adapterType ?? "—"}</AdminTd>
                <AdminTd mono muted>
                  {row.careersUrl ?? "—"}
                </AdminTd>
                <AdminTd>
                  <AdminPill tone={STATUS_TONE[row.status]}>
                    {STATUS_LABELS[row.status]}
                  </AdminPill>
                </AdminTd>
                <AdminTd align="right" mono>
                  {row.jobCount}
                </AdminTd>
                <AdminTd align="right">
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      justifyContent: "flex-end",
                    }}
                  >
                    {row.status === "VALIDATED" && (
                      <button
                        className={buttonVariants({ size: "sm" })}
                        disabled={pendingActionId === row.id}
                        onClick={() => handlePromote(row.id)}
                        type="button"
                      >
                        Criar fonte
                      </button>
                    )}
                    {row.status !== "IMPORTED" && (
                      <button
                        className={buttonVariants({
                          size: "sm",
                          variant: "outline",
                        })}
                        disabled={pendingActionId === row.id}
                        onClick={() => handleDismiss(row.id)}
                        type="button"
                      >
                        Descartar
                      </button>
                    )}
                  </div>
                </AdminTd>
              </tr>
            ))
          )}
        </tbody>
      </AdminTable>
    </div>
  );
}
