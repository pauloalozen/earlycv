"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  | "NO_TECH_JOBS"
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
  rawJobCount: number;
  errorMessage: string | null;
  createdAt: string;
};

type PromoteAllReport = {
  errors: { id: string; message: string; name: string }[];
  failedCount: number;
  promotedCount: number;
  totalCount: number;
};

const MANUAL_ADAPTER_TYPES = [
  "gupy",
  "greenhouse",
  "lever",
  "ashby",
  "inhire",
  "teamtailor",
  "workday",
  "talentbrew",
  "custom_html",
  "custom_api",
] as const;

const QUEUE_STATUSES: DiscoveredCompanyStatus[] = [
  "PENDING",
  "VALIDATED",
  "NO_ACTIVE_JOBS",
  "NO_TECH_JOBS",
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
  NO_TECH_JOBS: "Sem vagas de tech",
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
  NO_TECH_JOBS: "warn",
  PENDING: "neutral",
  VALIDATED: "ok",
};

export function DiscoveryTabClient() {
  const [rows, setRows] = useState<DiscoveredCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"fila" | "historico">("fila");
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [validateLimitInput, setValidateLimitInput] = useState("30");
  const [promotingAll, setPromotingAll] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [manualFormRowId, setManualFormRowId] = useState<string | null>(null);
  const [manualCareersUrl, setManualCareersUrl] = useState("");
  const [manualAdapterType, setManualAdapterType] = useState<string>(
    MANUAL_ADAPTER_TYPES[0],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [adapterFilter, setAdapterFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState<"adapterType" | "status" | null>(
    null,
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const statuses = view === "fila" ? QUEUE_STATUSES : HISTORY_STATUSES;

  useEffect(() => {
    setStatusFilter("");
  }, [view]);

  function toggleSort(field: "adapterType" | "status") {
    if (sortField !== field) {
      setSortField(field);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortField(null);
  }

  const displayedRows = useMemo(() => {
    let result = rows;
    if (adapterFilter) {
      result = result.filter((r) => r.adapterType === adapterFilter);
    }
    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (sortField) {
      result = [...result].sort((a, b) => {
        const av = a[sortField] ?? "";
        const bv = b[sortField] ?? "";
        const cmp = av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, adapterFilter, statusFilter, sortField, sortDir]);

  function handleExportCsv() {
    const header = [
      "nome",
      "adapter",
      "url",
      "status",
      "vagas",
      "vagas_no_board",
      "detalhes",
      "criado_em",
    ];
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.name,
          row.adapterType ?? "",
          row.careersUrl ?? "",
          STATUS_LABELS[row.status],
          String(row.jobCount),
          String(row.rawJobCount),
          row.errorMessage ?? "",
          row.createdAt,
        ]
          .map(escapeCsv)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `descoberta-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

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

  // Dispara como job de background (runKind DISCOVERY_VALIDATE) em vez de
  // rodar sincrono aqui — a tela nao trava esperando N probes/buscas
  // terminarem, e a execução fica visível/acompanhável na aba Jobs, igual
  // aos outros tipos (CRAWL/LOGO_FETCH).
  async function handleValidate(limit?: number) {
    setShowValidateModal(false);
    setValidating(true);
    setError(null);
    setMessage(null);
    try {
      const url = limit
        ? `/api/admin/ingestion/ingestion-jobs/run-discovery-validate?limit=${limit}`
        : "/api/admin/ingestion/ingestion-jobs/run-discovery-validate";
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        setError("Falha ao disparar job de validação.");
        return;
      }
      setMessage(
        `Job de validação disparado (${limit ? `até ${limit} candidato(s)` : "fila inteira"}). Acompanhe em Jobs > Histórico de execuções.`,
      );
      await fetchRows();
    } finally {
      setValidating(false);
    }
  }

  async function handleValidateOne(id: string) {
    setPendingActionId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/ingestion/discovery/${id}/validate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Falha ao validar candidato.");
        return;
      }
      setMessage(
        `"${data.name}" revalidado: ${STATUS_LABELS[data.status as DiscoveredCompanyStatus] ?? data.status}.`,
      );
      await fetchRows();
    } finally {
      setPendingActionId(null);
    }
  }

  async function handlePromoteAll() {
    setPromotingAll(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ingestion/discovery/promote-all", {
        method: "POST",
      });
      const data: PromoteAllReport = await res.json();
      if (!res.ok) {
        setError("Falha ao criar fontes em massa.");
        return;
      }
      setMessage(
        `${data.promotedCount}/${data.totalCount} fonte(s) criada(s)` +
          (data.failedCount > 0 ? `, ${data.failedCount} falhou(aram).` : "."),
      );
      await fetchRows();
    } finally {
      setPromotingAll(false);
    }
  }

  function openManualForm(id: string) {
    setManualFormRowId(id);
    setManualCareersUrl("");
    setManualAdapterType(MANUAL_ADAPTER_TYPES[0]);
    setError(null);
  }

  async function handlePromoteManual(id: string) {
    if (!manualCareersUrl.trim()) {
      setError("Informe a URL do board de vagas.");
      return;
    }
    setPendingActionId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/ingestion/discovery/${id}/promote-manual`,
        {
          body: JSON.stringify({
            adapterType: manualAdapterType,
            careersUrl: manualCareersUrl.trim(),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Falha ao criar fonte manualmente.");
        return;
      }
      setManualFormRowId(null);
      await fetchRows();
    } finally {
      setPendingActionId(null);
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
            onClick={() => setShowValidateModal(true)}
            type="button"
          >
            {validating ? "Validando..." : "Validar pendentes"}
          </button>
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            disabled={promotingAll}
            onClick={handlePromoteAll}
            type="button"
          >
            {promotingAll ? "Criando fontes..." : "Criar todas as fontes"}
          </button>
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            disabled={rows.length === 0}
            onClick={handleExportCsv}
            type="button"
          >
            Exportar CSV
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          onChange={(event) => setAdapterFilter(event.target.value)}
          style={{
            background: AT.card,
            borderColor: AT.border,
            color: AT.ink2,
          }}
          value={adapterFilter}
        >
          <option value="">Todos os adapters</option>
          {MANUAL_ADAPTER_TYPES.map((adapter) => (
            <option key={adapter} value={adapter}>
              {adapter}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          onChange={(event) => setStatusFilter(event.target.value)}
          style={{
            background: AT.card,
            borderColor: AT.border,
            color: AT.ink2,
          }}
          value={statusFilter}
        >
          <option value="">Todos os status</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {view === "fila" &&
        !loading &&
        (() => {
          const counts = QUEUE_STATUSES.reduce<
            Record<DiscoveredCompanyStatus, number>
          >(
            (acc, status) => {
              acc[status] = rows.filter((r) => r.status === status).length;
              return acc;
            },
            {} as Record<DiscoveredCompanyStatus, number>,
          );
          const promotableCount =
            counts.VALIDATED + counts.NO_TECH_JOBS + counts.NO_ACTIVE_JOBS;

          if (promotableCount === 0) return null;

          return (
            <div
              style={{
                alignItems: "center",
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                borderRadius: 8,
                color: "#065f46",
                display: "flex",
                fontSize: 13,
                gap: 8,
                justifyContent: "space-between",
                padding: "8px 12px",
              }}
            >
              <span>
                <strong>{promotableCount}</strong>{" "}
                {promotableCount === 1
                  ? "candidato validado pronto"
                  : "candidatos validados prontos"}{" "}
                pra criar fonte ({counts.VALIDATED} validada,{" "}
                {counts.NO_TECH_JOBS} sem vaga de tech,{" "}
                {counts.NO_ACTIVE_JOBS} sem vaga ativa).
              </span>
              <button
                className={buttonVariants({ size: "sm" })}
                disabled={promotingAll}
                onClick={handlePromoteAll}
                type="button"
              >
                {promotingAll ? "Criando fontes..." : "Criar todas as fontes"}
              </button>
            </div>
          );
        })()}

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Nome</AdminTh>
            <AdminTh w={110}>
              <button
                onClick={() => toggleSort("adapterType")}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  gap: 4,
                }}
                type="button"
              >
                Adapter
                {sortField === "adapterType" && (
                  <span>{sortDir === "asc" ? "▲" : "▼"}</span>
                )}
              </button>
            </AdminTh>
            <AdminTh>URL</AdminTh>
            <AdminTh>Detalhes</AdminTh>
            <AdminTh w={110}>
              <button
                onClick={() => toggleSort("status")}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  gap: 4,
                }}
                type="button"
              >
                Status
                {sortField === "status" && (
                  <span>{sortDir === "asc" ? "▲" : "▼"}</span>
                )}
              </button>
            </AdminTh>
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
          ) : displayedRows.length === 0 ? (
            <tr>
              <AdminTd muted>Nenhum candidato nessa visão.</AdminTd>
            </tr>
          ) : (
            displayedRows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <AdminTd>{row.name}</AdminTd>
                  <AdminTd mono>{row.adapterType ?? "—"}</AdminTd>
                  <AdminTd mono muted>
                    {row.careersUrl ?? "—"}
                  </AdminTd>
                  <AdminTd muted>
                    {row.errorMessage ? (
                      <div
                        style={{
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={row.errorMessage}
                      >
                        {row.errorMessage}
                      </div>
                    ) : (
                      "—"
                    )}
                  </AdminTd>
                  <AdminTd>
                    <AdminPill tone={STATUS_TONE[row.status]}>
                      {STATUS_LABELS[row.status]}
                    </AdminPill>
                  </AdminTd>
                  <AdminTd align="right" mono>
                    {row.status === "NO_TECH_JOBS"
                      ? `0 (${row.rawJobCount} no board)`
                      : row.jobCount}
                  </AdminTd>
                  <AdminTd align="right">
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                      }}
                    >
                      {row.status !== "IMPORTED" && (
                        <button
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          disabled={pendingActionId === row.id}
                          onClick={() => handleValidateOne(row.id)}
                          type="button"
                        >
                          Validar
                        </button>
                      )}
                      {(row.status === "VALIDATED" ||
                        row.status === "NO_TECH_JOBS" ||
                        row.status === "NO_ACTIVE_JOBS") && (
                        <button
                          className={buttonVariants({ size: "sm" })}
                          disabled={pendingActionId === row.id}
                          onClick={() => handlePromote(row.id)}
                          type="button"
                        >
                          Criar fonte
                        </button>
                      )}
                      {(row.status === "DISMISSED" ||
                        row.status === "INVALID") && (
                        <button
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          disabled={pendingActionId === row.id}
                          onClick={() =>
                            manualFormRowId === row.id
                              ? setManualFormRowId(null)
                              : openManualForm(row.id)
                          }
                          type="button"
                        >
                          {manualFormRowId === row.id
                            ? "Cancelar"
                            : "Link manual"}
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
                {manualFormRowId === row.id && (
                  <tr key={`${row.id}-manual-form`}>
                    <td
                      colSpan={7}
                      style={{
                        padding: "10px 16px",
                        borderBottom: `1px solid ${AT.borderSoft}`,
                      }}
                    >
                      <div
                        style={{
                          alignItems: "center",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <span style={{ color: AT.muted, fontSize: 12 }}>
                          Achei manualmente:
                        </span>
                        <input
                          className="text-[12.5px]"
                          onChange={(event) =>
                            setManualCareersUrl(event.target.value)
                          }
                          placeholder="https://empresa.gupy.io"
                          style={{
                            border: `1px solid ${AT.borderSoft}`,
                            borderRadius: 6,
                            flex: "1 1 260px",
                            fontFamily: '"Geist Mono", monospace',
                            fontSize: 12,
                            padding: "6px 8px",
                          }}
                          type="text"
                          value={manualCareersUrl}
                        />
                        <select
                          onChange={(event) =>
                            setManualAdapterType(event.target.value)
                          }
                          style={{
                            border: `1px solid ${AT.borderSoft}`,
                            borderRadius: 6,
                            fontSize: 12.5,
                            padding: "6px 8px",
                          }}
                          value={manualAdapterType}
                        >
                          {MANUAL_ADAPTER_TYPES.map((adapter) => (
                            <option key={adapter} value={adapter}>
                              {adapter}
                            </option>
                          ))}
                        </select>
                        <button
                          className={buttonVariants({ size: "sm" })}
                          disabled={pendingActionId === row.id}
                          onClick={() => handlePromoteManual(row.id)}
                          type="button"
                        >
                          Criar fonte
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </AdminTable>

      {showValidateModal && (
        <div
          style={{
            alignItems: "center",
            background: "rgba(10,10,10,0.4)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            position: "fixed",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: AT.card,
              border: `1px solid ${AT.border}`,
              borderRadius: 10,
              boxShadow: "0 8px 32px rgba(10,10,10,0.25)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 20,
              width: 340,
            }}
          >
            <h3 style={{ color: AT.ink, fontSize: 14, fontWeight: 600 }}>
              Validar pendentes
            </h3>
            <p style={{ color: AT.muted, fontSize: 12 }}>
              Roda em background (aba Jobs) — cada candidato processado recebe 1
              consulta de busca web (se habilitada). Escolha quantos processar,
              ou rode a fila inteira.
            </p>
            <label
              style={{
                color: AT.ink2,
                display: "flex",
                flexDirection: "column",
                fontSize: 12.5,
                gap: 4,
              }}
            >
              Quantos candidatos
              <input
                min={1}
                onChange={(event) => setValidateLimitInput(event.target.value)}
                style={{
                  border: `1px solid ${AT.borderSoft}`,
                  borderRadius: 6,
                  fontSize: 13,
                  padding: "6px 8px",
                }}
                type="number"
                value={validateLimitInput}
              />
            </label>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 4,
              }}
            >
              <button
                className={buttonVariants({ size: "sm", variant: "outline" })}
                onClick={() => setShowValidateModal(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className={buttonVariants({ size: "sm", variant: "outline" })}
                onClick={() => handleValidate()}
                type="button"
              >
                Rodar fila inteira
              </button>
              <button
                className={buttonVariants({ size: "sm" })}
                onClick={() => {
                  const parsed = Number.parseInt(validateLimitInput, 10);
                  handleValidate(
                    Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                  );
                }}
                type="button"
              >
                Rodar {validateLimitInput || "N"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
