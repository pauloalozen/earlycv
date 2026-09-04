import Link from "next/link";
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
import {
  requeueMatchJobAction,
  requeueProfileMatchJobAction,
} from "@/app/admin/monitor/actions";
import {
  type AdminMonitorFailures,
  type AdminMonitorOverview,
  getAdminMonitorFailures,
  getAdminMonitorOverview,
  searchAdminMonitorJobs,
  searchAdminMonitorUsers,
} from "@/lib/admin-monitor-api";

// Conteúdo do antigo /admin/monitor, extraído pra virar a aba "Matching"
// de Ingestão (ver docs/specs/2026-09-04-admin-alerta-vagas-tab.md,
// follow-up "menu real do admin + split Monitor/Alerta") — tudo sobre
// e-mail/digest saiu daqui pra /admin/alerta-vagas; isto é só diagnóstico
// do motor de matching (perfis, filas, recomendações). redirectPath e
// hiddenFields existem pra esse painel funcionar tanto embutido numa aba
// (formulários GET precisam manter `tab=matching` na volta) quanto, se
// algum dia for reaproveitado, em outra rota própria.
export async function MatchingTabContent({
  token,
  userQuery,
  jobQuery,
  redirectPath,
  hiddenFields = {},
}: {
  token: string;
  userQuery?: string;
  jobQuery?: string;
  redirectPath: string;
  hiddenFields?: Record<string, string>;
}) {
  let overview: AdminMonitorOverview;
  let failures: AdminMonitorFailures;
  try {
    [overview, failures] = await Promise.all([
      getAdminMonitorOverview(token),
      getAdminMonitorFailures(token),
    ]);
  } catch {
    return (
      <p style={{ fontSize: 13, color: AT.danger }}>
        Não foi possível carregar o diagnóstico de matching agora.
      </p>
    );
  }

  const [userResults, jobResults] = await Promise.all([
    userQuery
      ? searchAdminMonitorUsers({ query: userQuery, limit: 10 }, token)
      : null,
    jobQuery
      ? searchAdminMonitorJobs({ query: jobQuery, limit: 10 }, token)
      : null,
  ]);

  return (
    <div>
      <AdminStatsRow cols={5}>
        <AdminStatCard
          label="Monitor configurado"
          value={String(overview.usersWithMonitorConfigured)}
        />
        <AdminStatCard
          label="Initializing"
          value={String(overview.usersInitializing)}
        />
        <AdminStatCard label="Active" value={String(overview.usersActive)} />
        <AdminStatCard
          label="Refreshing"
          value={String(overview.usersRefreshing)}
        />
        <AdminStatCard
          label="Com entitlement"
          value={String(overview.usersWithEntitlement)}
        />
      </AdminStatsRow>

      <AdminStatsRow cols={4}>
        <AdminStatCard
          label="Recomendações ativas"
          value={String(overview.recommendations.active)}
        />
        <AdminStatCard
          label="Novas / não vistas"
          value={String(overview.recommendations.new)}
        />
        <AdminStatCard
          label="Superseded"
          value={String(overview.recommendations.superseded)}
        />
        <AdminStatCard
          label="Dismissed"
          value={String(overview.recommendations.dismissed)}
        />
      </AdminStatsRow>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Filas de processamento</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
          }}
        >
          <JobStatusCard
            title="Matching de vagas (MonitorMatchJob)"
            counts={overview.matchJobs}
          />
          <JobStatusCard
            title="Matching de perfil (MonitorProfileMatchJob)"
            counts={overview.profileMatchJobs}
          />
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionTitle>
          Problemas do Radar{" "}
          <span style={{ color: AT.muted, fontWeight: 400 }}>
            (travado além de{" "}
            {Math.round(failures.staleProcessingThresholdMs / 60_000)} min em
            PROCESSING)
          </span>
        </SectionTitle>
        <AdminStatsRow cols={2}>
          <AdminStatCard
            label="MonitorMatchJob preso"
            value={String(failures.stuckProcessingCounts.matchJobs)}
          />
          <AdminStatCard
            label="MonitorProfileMatchJob preso"
            value={String(failures.stuckProcessingCounts.profileMatchJobs)}
          />
        </AdminStatsRow>

        {failures.failedMatchJobs.length > 0 && (
          <FailureTable
            title={`MonitorMatchJob FAILED (${failures.failedMatchJobs.length})`}
            redirectPath={redirectPath}
            rows={failures.failedMatchJobs.map((j) => ({
              id: j.id,
              label: j.job.title,
              detailHref: `/admin/monitor/vagas/${j.jobId}`,
              attempts: j.attempts,
              lastError: j.lastError,
              updatedAt: j.updatedAt,
              requeueAction: "requeue-match-job" as const,
            }))}
          />
        )}
        {failures.failedProfileMatchJobs.length > 0 && (
          <FailureTable
            title={`MonitorProfileMatchJob FAILED (${failures.failedProfileMatchJobs.length})`}
            redirectPath={redirectPath}
            rows={failures.failedProfileMatchJobs.map((j) => ({
              id: j.id,
              label: `${j.user.name} · ${j.user.email}`,
              detailHref: `/admin/monitor/usuarios/${j.userId}`,
              attempts: j.attempts,
              lastError: j.lastError,
              updatedAt: j.updatedAt,
              requeueAction: "requeue-profile-match-job" as const,
            }))}
          />
        )}
        {failures.stuckProfiles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: AT.muted, marginBottom: 6 }}>
              Perfis em INITIALIZING/REFRESHING há mais de{" "}
              {Math.round(failures.staleMonitorStatusThresholdMs / 60_000)} min
              sem atualização:
            </p>
            <AdminTable>
              <thead>
                <tr>
                  <AdminTh>Usuário</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Atualizado em</AdminTh>
                </tr>
              </thead>
              <tbody>
                {failures.stuckProfiles.map((p) => (
                  <tr key={p.userId}>
                    <AdminTd>
                      <Link
                        href={`/admin/monitor/usuarios/${p.userId}`}
                        style={{ textDecoration: "underline" }}
                      >
                        {p.user.name} · {p.user.email}
                      </Link>
                    </AdminTd>
                    <AdminTd>
                      <AdminPill tone="warn">{p.monitorStatus}</AdminPill>
                    </AdminTd>
                    <AdminTd mono muted>
                      {fmtDate(p.updatedAt)}
                    </AdminTd>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </div>
        )}
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionTitle>Buscar usuário</SectionTitle>
        <form method="GET" style={{ marginBottom: 12 }}>
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <AdminFilterBar>
            <input
              type="text"
              name="userQuery"
              defaultValue={userQuery}
              placeholder="e-mail, nome ou userId"
              style={inputStyle}
            />
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              Buscar
            </button>
          </AdminFilterBar>
        </form>
        {userResults && (
          <>
            <AdminTable>
              <thead>
                <tr>
                  <AdminTh>Nome</AdminTh>
                  <AdminTh>E-mail</AdminTh>
                  <AdminTh>Monitor status</AdminTh>
                  <AdminTh>Criado em</AdminTh>
                  <AdminTh w={80}>{null}</AdminTh>
                </tr>
              </thead>
              <tbody>
                {userResults.users.map((u) => (
                  <tr key={u.id}>
                    <AdminTd>{u.name}</AdminTd>
                    <AdminTd muted>{u.email}</AdminTd>
                    <AdminTd>
                      {u.radarProfile ? (
                        <AdminPill
                          tone={
                            u.radarProfile.monitorStatus === "ACTIVE"
                              ? "ok"
                              : "warn"
                          }
                        >
                          {u.radarProfile.monitorStatus}
                        </AdminPill>
                      ) : (
                        <AdminPill>sem perfil</AdminPill>
                      )}
                    </AdminTd>
                    <AdminTd mono muted>
                      {fmtDate(u.createdAt)}
                    </AdminTd>
                    <AdminTd align="right">
                      <Link
                        href={`/admin/monitor/usuarios/${u.id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Abrir
                      </Link>
                    </AdminTd>
                  </tr>
                ))}
                {userResults.users.length === 0 && (
                  <tr>
                    <AdminTd>
                      <span style={{ color: AT.muted }}>
                        Nenhum usuário encontrado.
                      </span>
                    </AdminTd>
                  </tr>
                )}
              </tbody>
            </AdminTable>
            <AdminPagination summary={`${userResults.total} usuário(s)`}>
              {null}
            </AdminPagination>
          </>
        )}
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionTitle>Buscar vaga</SectionTitle>
        <form method="GET" style={{ marginBottom: 12 }}>
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <AdminFilterBar>
            <input
              type="text"
              name="jobQuery"
              defaultValue={jobQuery}
              placeholder="jobId, slug, cargo ou empresa"
              style={inputStyle}
            />
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              Buscar
            </button>
          </AdminFilterBar>
        </form>
        {jobResults && (
          <>
            <AdminTable>
              <thead>
                <tr>
                  <AdminTh>Vaga</AdminTh>
                  <AdminTh>Empresa</AdminTh>
                  <AdminTh>Enrichment</AdminTh>
                  <AdminTh>Captada em</AdminTh>
                  <AdminTh w={80}>{null}</AdminTh>
                </tr>
              </thead>
              <tbody>
                {jobResults.jobs.map((j) => (
                  <tr key={j.id}>
                    <AdminTd>{j.title}</AdminTd>
                    <AdminTd muted>{j.company.name}</AdminTd>
                    <AdminTd>
                      {j.enrichment ? (
                        <AdminPill
                          tone={
                            j.enrichment.enrichmentStatus === "COMPLETED"
                              ? "ok"
                              : "warn"
                          }
                        >
                          {j.enrichment.enrichmentStatus}
                        </AdminPill>
                      ) : (
                        <AdminPill>sem enrichment</AdminPill>
                      )}
                    </AdminTd>
                    <AdminTd mono muted>
                      {fmtDate(j.firstSeenAt)}
                    </AdminTd>
                    <AdminTd align="right">
                      <Link
                        href={`/admin/monitor/vagas/${j.id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Abrir
                      </Link>
                    </AdminTd>
                  </tr>
                ))}
                {jobResults.jobs.length === 0 && (
                  <tr>
                    <AdminTd>
                      <span style={{ color: AT.muted }}>
                        Nenhuma vaga encontrada.
                      </span>
                    </AdminTd>
                  </tr>
                )}
              </tbody>
            </AdminTable>
            <AdminPagination summary={`${jobResults.total} vaga(s)`}>
              {null}
            </AdminPagination>
          </>
        )}
      </section>
    </div>
  );
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: '"Geist Mono", monospace',
        fontSize: 11,
        letterSpacing: 1.1,
        color: AT.muted2,
        fontWeight: 500,
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </h2>
  );
}

function JobStatusCard({
  title,
  counts,
}: {
  title: string;
  counts: Record<string, number>;
}) {
  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          marginBottom: 10,
          color: AT.ink2,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Object.entries(counts).map(([status, count]) => (
          <AdminPill
            key={status}
            tone={
              status === "FAILED"
                ? "danger"
                : status === "PROCESSING"
                  ? "warn"
                  : "neutral"
            }
            mono
          >
            {status}: {count}
          </AdminPill>
        ))}
      </div>
    </div>
  );
}

function FailureTable({
  title,
  rows,
  redirectPath,
}: {
  title: string;
  redirectPath: string;
  rows: {
    id: string;
    label: string;
    detailHref: string;
    attempts: number;
    lastError: string | null;
    updatedAt: string;
    requeueAction: "requeue-match-job" | "requeue-profile-match-job";
  }[];
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, color: AT.muted, marginBottom: 6 }}>{title}</p>
      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Entidade</AdminTh>
            <AdminTh>Attempts</AdminTh>
            <AdminTh>Último erro</AdminTh>
            <AdminTh>Atualizado em</AdminTh>
            <AdminTh w={110}>{null}</AdminTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <AdminTd>
                <Link
                  href={row.detailHref}
                  style={{ textDecoration: "underline" }}
                >
                  {row.label}
                </Link>
              </AdminTd>
              <AdminTd mono>{row.attempts}</AdminTd>
              <AdminTd muted>{row.lastError ?? "—"}</AdminTd>
              <AdminTd mono muted>
                {fmtDate(row.updatedAt)}
              </AdminTd>
              <AdminTd align="right">
                <RequeueForm
                  id={row.id}
                  action={row.requeueAction}
                  redirectPath={redirectPath}
                />
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>
    </div>
  );
}

function RequeueForm({
  id,
  action,
  redirectPath,
}: {
  id: string;
  action: "requeue-match-job" | "requeue-profile-match-job";
  redirectPath: string;
}) {
  const actionFn =
    action === "requeue-match-job"
      ? requeueMatchJobAction
      : requeueProfileMatchJobAction;

  return (
    <form action={actionFn}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="redirectPath" value={redirectPath} />
      <button
        type="submit"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Reenfileirar
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  borderRadius: 6,
  border: `1px solid ${AT.border}`,
  background: AT.card,
  fontSize: 12.5,
  minWidth: 260,
};
