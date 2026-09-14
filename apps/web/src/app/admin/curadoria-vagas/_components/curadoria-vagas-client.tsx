"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminFilterBar,
  AdminPagination,
  AdminPill,
  AdminStatCard,
  AdminStatsRow,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { buildLinkedinGoogleSearchUrl } from "@/lib/linkedin-google-search-url";

type Period = "today" | "24h" | "date";

type CurationStatus =
  | "NOT_CHECKED"
  | "NOT_FOUND_ON_LINKEDIN"
  | "FOUND_ON_LINKEDIN"
  | "INCONCLUSIVE";

type SeniorityLevel =
  | "INTERN"
  | "JUNIOR"
  | "MID"
  | "SENIOR"
  | "LEAD"
  | "STAFF"
  | "MANAGER"
  | "DIRECTOR"
  | "UNKNOWN";

type WorkModel = "remote" | "hybrid" | "onsite";

type CurationJobRow = {
  id: string;
  title: string;
  company: { name: string };
  slug: string | null;
  sourceJobUrl: string;
  locationText: string;
  workModel: string | null;
  firstSeenAt: string;
  enrichment: {
    dominantArea: string | null;
    seniority: SeniorityLevel | null;
    enrichmentStatus: string;
  } | null;
  linkedinCuration: {
    status: CurationStatus;
    linkedinUrl: string | null;
    checkedByAdminId: string | null;
    checkedAt: string | null;
  } | null;
};

type JobsResponse = {
  jobs: CurationJobRow[];
  total: number;
  page: number;
  pageSize: number;
};

type CountersResponse = {
  bySeniority: { seniority: SeniorityLevel; count: number }[];
  semEnriquecimento: number;
};

const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  INTERN: "Estágio",
  JUNIOR: "Júnior",
  MID: "Pleno",
  SENIOR: "Sênior",
  LEAD: "Lead",
  STAFF: "Staff",
  MANAGER: "Gerência",
  DIRECTOR: "Diretoria",
  UNKNOWN: "Desconhecida",
};

const SENIORITY_ORDER: SeniorityLevel[] = [
  "INTERN",
  "JUNIOR",
  "MID",
  "SENIOR",
  "LEAD",
  "STAFF",
  "MANAGER",
  "DIRECTOR",
  "UNKNOWN",
];

const DOMINANT_AREAS = [
  "DATA_AI",
  "SOFTWARE_ENGINEERING",
  "CLOUD_DEVOPS",
  "CYBERSECURITY",
  "PRODUCT",
  "DESIGN_UX",
  "QA_TEST",
  "PROJECT_AGILE",
  "ARCHITECTURE",
  "LEADERSHIP",
  "GROWTH_MARKETING",
  "BUSINESS_ANALYTICS",
  "CX_DIGITAL",
  "IT_SUPPORT",
  "ERP_FUNCTIONAL",
  "OTHER",
] as const;

const WORK_MODEL_LABELS: Record<WorkModel, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
};

const STATUS_LABELS: Record<CurationStatus, string> = {
  NOT_CHECKED: "Não verificada",
  NOT_FOUND_ON_LINKEDIN: "Não encontrada no LinkedIn",
  FOUND_ON_LINKEDIN: "Encontrada no LinkedIn",
  INCONCLUSIVE: "Inconclusiva",
};

const STATUS_TONE: Record<
  CurationStatus,
  "neutral" | "ok" | "warn" | "danger"
> = {
  NOT_CHECKED: "neutral",
  NOT_FOUND_ON_LINKEDIN: "ok",
  FOUND_ON_LINKEDIN: "danger",
  INCONCLUSIVE: "warn",
};

// Data "de hoje" em America/Sao_Paulo, só pra pré-preencher o input de data
// específica — a fonte de verdade do intervalo é sempre calculada no backend
// (resolveCurationDateRange).
function spTodayString(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function formatCapturedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function CuradoriaVagasClient() {
  const [period, setPeriod] = useState<Period>("today");
  const [date, setDate] = useState(spTodayString());
  const [seniorityFilter, setSeniorityFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [workModelFilter, setWorkModelFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [curationStatusFilter, setCurationStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<JobsResponse | null>(null);
  const [counters, setCounters] = useState<CountersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const debouncedCompany = useDebounce(companyFilter, 300);
  const debouncedLocation = useDebounce(locationFilter, 300);

  const sharedParams = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (period === "date" && date) params.set("date", date);
    if (areaFilter) params.set("areaFilter", areaFilter);
    if (debouncedCompany) params.set("companyFilter", debouncedCompany);
    if (workModelFilter) params.set("workModelFilter", workModelFilter);
    if (debouncedLocation) params.set("locationFilter", debouncedLocation);
    if (curationStatusFilter)
      params.set("curationStatusFilter", curationStatusFilter);
    return params;
  }, [
    period,
    date,
    areaFilter,
    debouncedCompany,
    workModelFilter,
    debouncedLocation,
    curationStatusFilter,
  ]);

  const fetchJobs = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams(sharedParams);
        params.set("page", String(p));
        params.set("pageSize", "20");
        if (seniorityFilter) params.set("seniorityFilter", seniorityFilter);
        const res = await fetch(`/api/admin/job-curation/jobs?${params}`);
        if (res.ok) setResult(await res.json());
      } finally {
        setLoading(false);
      }
    },
    [sharedParams, seniorityFilter],
  );

  const fetchCounters = useCallback(async () => {
    const res = await fetch(
      `/api/admin/job-curation/counters/seniority?${sharedParams}`,
    );
    if (res.ok) setCounters(await res.json());
  }, [sharedParams]);

  useEffect(() => {
    setPage(1);
    fetchJobs(1);
    fetchCounters();
  }, [fetchJobs, fetchCounters]);

  useEffect(() => {
    fetchJobs(page);
  }, [page, fetchJobs]);

  const handleSaveStatus = useCallback(
    async (jobId: string, status: CurationStatus, linkedinUrl?: string) => {
      setSavingId(jobId);
      try {
        const res = await fetch(`/api/admin/job-curation/jobs/${jobId}`, {
          body: JSON.stringify(
            status === "FOUND_ON_LINKEDIN"
              ? { status, linkedinUrl }
              : { status },
          ),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        });
        if (res.ok) {
          await fetchJobs(page);
        } else {
          const body = await res.json().catch(() => null);
          window.alert(body?.message ?? "Falha ao salvar a checagem.");
        }
      } finally {
        setSavingId(null);
      }
    },
    [fetchJobs, page],
  );

  const total = result?.total ?? 0;
  const pageSize = result?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Período */}
      <div
        style={{
          display: "inline-flex",
          gap: 2,
          background: AT.bgAlt,
          borderRadius: 8,
          padding: 3,
          border: `1px solid ${AT.border}`,
          width: "fit-content",
        }}
      >
        {(
          [
            { id: "today", label: "Hoje" },
            { id: "24h", label: "Últimas 24 horas" },
            { id: "date", label: "Data específica" },
          ] as const
        ).map((p) => {
          const active = period === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                fontFamily: '"Geist", sans-serif',
                border: active
                  ? `1px solid ${AT.border}`
                  : "1px solid transparent",
                cursor: "pointer",
                background: active ? AT.card : "transparent",
                color: active ? AT.ink2 : AT.muted,
              }}
            >
              {p.label}
            </button>
          );
        })}
        {period === "date" && (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 rounded-md border px-2 text-[12.5px]"
            style={{
              borderColor: AT.border,
              background: AT.card,
              color: AT.ink2,
              marginLeft: 4,
            }}
          />
        )}
      </div>

      {/* Contadores por senioridade */}
      <AdminStatsRow cols={SENIORITY_ORDER.length + 1}>
        {SENIORITY_ORDER.map((level) => (
          <AdminStatCard
            key={level}
            label={SENIORITY_LABELS[level]}
            value={String(
              counters?.bySeniority.find((s) => s.seniority === level)?.count ??
                0,
            )}
          />
        ))}
        <AdminStatCard
          label="Sem enriquecimento"
          value={String(counters?.semEnriquecimento ?? 0)}
          tooltip="Vaga ainda não passou pelo worker de enriquecimento (ou ficou sem seniority) — aparece na listagem, mas nenhum filtro de senioridade específica vai incluí-la."
        />
      </AdminStatsRow>

      {/* Filtros */}
      <AdminFilterBar>
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
            minWidth: 200,
          }}
          placeholder="Empresa"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
        />
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
            minWidth: 200,
          }}
          placeholder="Localização (texto livre)"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        />
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: AT.border,
            background: AT.card,
            color: AT.ink2,
          }}
          value={seniorityFilter}
          onChange={(e) => setSeniorityFilter(e.target.value)}
        >
          <option value="">Todas as senioridades</option>
          {SENIORITY_ORDER.map((level) => (
            <option key={level} value={level}>
              {SENIORITY_LABELS[level]}
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
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
        >
          <option value="">Todas as áreas</option>
          {DOMINANT_AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
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
          value={workModelFilter}
          onChange={(e) => setWorkModelFilter(e.target.value)}
        >
          <option value="">Toda modalidade</option>
          {(Object.keys(WORK_MODEL_LABELS) as WorkModel[]).map((wm) => (
            <option key={wm} value={wm}>
              {WORK_MODEL_LABELS[wm]}
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
          value={curationStatusFilter}
          onChange={(e) => setCurationStatusFilter(e.target.value)}
        >
          <option value="">Qualquer checagem</option>
          {(Object.keys(STATUS_LABELS) as CurationStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={buttonVariants({ size: "sm", variant: "outline" })}
          onClick={() =>
            setCurationStatusFilter(
              curationStatusFilter === "NOT_FOUND_ON_LINKEDIN"
                ? ""
                : "NOT_FOUND_ON_LINKEDIN",
            )
          }
          style={
            curationStatusFilter === "NOT_FOUND_ON_LINKEDIN"
              ? { borderColor: AT.ok, color: AT.ok }
              : undefined
          }
        >
          Só "não encontrada no LinkedIn"
        </button>
      </AdminFilterBar>

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
            ? "Nenhuma vaga encontrada para o período/filtros."
            : `Mostrando ${start}–${end} de ${total}`}
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Cargo</AdminTh>
            <AdminTh w={180}>Empresa</AdminTh>
            <AdminTh w={100}>Senioridade</AdminTh>
            <AdminTh w={130}>Área</AdminTh>
            <AdminTh w={160}>Local / Modalidade</AdminTh>
            <AdminTh w={140}>Capturada em</AdminTh>
            <AdminTh w={130}>Links</AdminTh>
            <AdminTh w={260}>Checagem LinkedIn</AdminTh>
          </tr>
        </thead>
        <tbody>
          {!loading && (!result || result.jobs.length === 0) && (
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
                Nenhuma vaga encontrada.
              </td>
            </tr>
          )}
          {result?.jobs.map((job) => (
            <JobCurationRow
              key={job.id}
              job={job}
              saving={savingId === job.id}
              onSave={handleSaveStatus}
            />
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

function JobCurationRow({
  job,
  saving,
  onSave,
}: {
  job: CurationJobRow;
  saving: boolean;
  onSave: (
    jobId: string,
    status: CurationStatus,
    linkedinUrl?: string,
  ) => Promise<void>;
}) {
  const currentStatus = job.linkedinCuration?.status ?? "NOT_CHECKED";
  const [pendingStatus, setPendingStatus] = useState<CurationStatus | null>(
    null,
  );
  const [urlDraft, setUrlDraft] = useState(
    job.linkedinCuration?.linkedinUrl ?? "",
  );

  const handleStatusChange = (value: CurationStatus) => {
    if (value === "FOUND_ON_LINKEDIN") {
      setPendingStatus(value);
      return;
    }
    setPendingStatus(null);
    void onSave(job.id, value);
  };

  const searchUrl = buildLinkedinGoogleSearchUrl(job.title, job.company.name);

  return (
    <tr>
      <AdminTd>{job.title}</AdminTd>
      <AdminTd muted>{job.company.name}</AdminTd>
      <AdminTd>
        {job.enrichment?.seniority ? (
          SENIORITY_LABELS[job.enrichment.seniority]
        ) : (
          <span style={{ color: AT.muted }}>—</span>
        )}
      </AdminTd>
      <AdminTd mono muted>
        {job.enrichment?.dominantArea ?? "—"}
      </AdminTd>
      <AdminTd muted>
        {job.workModel
          ? (WORK_MODEL_LABELS[job.workModel as WorkModel] ?? job.workModel)
          : "—"}
        {job.locationText ? ` · ${job.locationText}` : ""}
      </AdminTd>
      <AdminTd mono muted>
        {formatCapturedAt(job.firstSeenAt)}
      </AdminTd>
      <AdminTd>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {job.slug && (
            <a
              href={`/radar/${job.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: AT.info }}
            >
              Abrir no EarlyCV
            </a>
          )}
          <a
            href={job.sourceJobUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: AT.info }}
          >
            Abrir vaga original
          </a>
          <button
            type="button"
            onClick={() =>
              window.open(searchUrl, "_blank", "noopener,noreferrer")
            }
            style={{
              fontSize: 12,
              color: AT.ink2,
              background: "none",
              border: "none",
              padding: 0,
              textAlign: "left",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Pesquisar no LinkedIn
          </button>
        </div>
      </AdminTd>
      <AdminTd>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AdminPill tone={STATUS_TONE[currentStatus]} mono>
              {STATUS_LABELS[currentStatus]}
            </AdminPill>
          </div>
          <select
            className="h-7 rounded-md border px-1 text-[11.5px]"
            style={{
              borderColor: AT.border,
              background: AT.card,
              color: AT.ink2,
            }}
            value={pendingStatus ?? currentStatus}
            disabled={saving}
            onChange={(e) =>
              handleStatusChange(e.target.value as CurationStatus)
            }
          >
            {(Object.keys(STATUS_LABELS) as CurationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {pendingStatus === "FOUND_ON_LINKEDIN" && (
            <div style={{ display: "flex", gap: 4 }}>
              <input
                className="h-7 rounded-md border px-2 text-[11.5px]"
                style={{
                  borderColor: AT.border,
                  background: AT.card,
                  color: AT.ink2,
                  flex: 1,
                }}
                placeholder="https://www.linkedin.com/jobs/view/..."
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
              />
              <button
                type="button"
                className={buttonVariants({ size: "sm" })}
                disabled={saving || !urlDraft.trim()}
                onClick={async () => {
                  await onSave(job.id, "FOUND_ON_LINKEDIN", urlDraft.trim());
                  setPendingStatus(null);
                }}
              >
                Salvar
              </button>
            </div>
          )}
          {job.linkedinCuration?.status === "FOUND_ON_LINKEDIN" &&
            job.linkedinCuration.linkedinUrl && (
              <a
                href={job.linkedinCuration.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: AT.info, wordBreak: "break-all" }}
              >
                {job.linkedinCuration.linkedinUrl}
              </a>
            )}
          {job.linkedinCuration?.checkedAt && (
            <span style={{ fontSize: 10.5, color: AT.faint }}>
              checado em {formatCapturedAt(job.linkedinCuration.checkedAt)} por{" "}
              {job.linkedinCuration.checkedByAdminId ?? "—"}
            </span>
          )}
        </div>
      </AdminTd>
    </tr>
  );
}
