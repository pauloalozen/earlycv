import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminFilterBar,
  AdminPageWrap,
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import {
  getAdminMonitorUserAttribution,
  getAdminMonitorUserDiagnostic,
  listAdminMonitorUserDigests,
  listAdminMonitorUserRecommendations,
} from "@/lib/admin-monitor-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { buttonVariants } from "../../../_components/admin-button";
import {
  forceUserRematchAction,
  requeueProfileMatchJobAction,
} from "../../actions";

export const metadata = buildAdminMetadata("Usuário — Meu Monitor");

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{
    status?: string;
    opportunityLevel?: string;
    page?: string;
  }>;
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

const STATUS_FILTERS = [
  { value: "", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "new", label: "Novas" },
  { value: "viewed", label: "Vistas" },
  { value: "dismissed", label: "Dismissed" },
  { value: "superseded", label: "Superseded" },
] as const;

export default async function AdminMonitorUserPage({
  params,
  searchParams,
}: PageProps) {
  const { userId } = await params;
  const { status, opportunityLevel, page } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/monitor/usuarios/${userId}`,
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let diagnostic: Awaited<ReturnType<typeof getAdminMonitorUserDiagnostic>>;
  try {
    diagnostic = await getAdminMonitorUserDiagnostic(userId, token);
  } catch (err) {
    if (err instanceof Error && err.message.includes("API 404")) {
      notFound();
    }
    const state = buildAdminStateModel(
      "unexpected-error",
      `/admin/monitor/usuarios/${userId}`,
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const [recommendations, digests, attribution] = await Promise.all([
    listAdminMonitorUserRecommendations(
      userId,
      {
        page: pageNum,
        limit: 20,
        status: status || undefined,
        opportunityLevel: opportunityLevel
          ? Number.parseInt(opportunityLevel, 10)
          : undefined,
      },
      token,
    ),
    listAdminMonitorUserDigests(userId, { page: 1, limit: 10 }, token),
    getAdminMonitorUserAttribution(userId, token),
  ]);

  const redirectPath = `/admin/monitor/usuarios/${userId}`;

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Meu Monitor · Diagnóstico de usuário"
        title={diagnostic.user.name}
        subtitle={`${diagnostic.user.email} · userId ${diagnostic.user.id} · criado em ${fmt(diagnostic.user.createdAt)}`}
        actions={
          <form action={forceUserRematchAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="redirectPath" value={redirectPath} />
            <button
              type="submit"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Forçar rematch
            </button>
          </form>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Panel title="Entitlement">
          <Row label="allowed">
            <AdminPill tone={diagnostic.entitlement.allowed ? "ok" : "danger"}>
              {String(diagnostic.entitlement.allowed)}
            </AdminPill>
          </Row>
          <Row label="reason">
            <AdminPill mono>{diagnostic.entitlement.reason}</AdminPill>
          </Row>
          <p style={{ fontSize: 11, color: AT.muted, marginTop: 8 }}>
            Resultado real de MonitorEntitlementService.canUseMonitor — nunca
            uma regra re-derivada aqui.
          </p>
        </Panel>

        <Panel title="Estado do Monitor">
          {diagnostic.monitor ? (
            <>
              <Row label="monitorStatus">
                <AdminPill
                  tone={
                    diagnostic.monitor.monitorStatus === "ACTIVE"
                      ? "ok"
                      : "warn"
                  }
                >
                  {diagnostic.monitor.monitorStatus}
                </AdminPill>
              </Row>
              <Row label="lastMatchedAt">
                {fmt(diagnostic.monitor.lastMatchedAt)}
              </Row>
              <Row label="matchFingerprint">
                <code style={{ fontSize: 10.5 }}>
                  {diagnostic.monitor.matchFingerprint?.slice(0, 16) ?? "—"}…
                </code>
              </Row>
              <Row label="generatedAt">
                {fmt(diagnostic.monitor.generatedAt)}
              </Row>
              <Row label="sourceResumeId">
                {diagnostic.monitor.sourceResumeId ?? "—"}
              </Row>
            </>
          ) : (
            <p style={{ fontSize: 12, color: AT.muted }}>
              Sem UserRadarProfile.
            </p>
          )}
        </Panel>
      </div>

      {diagnostic.profile && (
        <div style={{ marginBottom: 24 }}>
          <Panel title="Perfil usado no matching">
            <p style={{ fontSize: 11, color: AT.muted, marginBottom: 10 }}>
              Campos abaixo do traço entram no fingerprint (mudá-los dispara
              rematch); os demais são apenas informativos hoje.
            </p>
            <Row label="areas">
              {diagnostic.profile.fingerprint.areas.join(", ") || "—"}
            </Row>
            <Row label="seniority">
              {diagnostic.profile.fingerprint.seniority}
            </Row>
            <Row label="skills">
              {diagnostic.profile.fingerprint.skills.join(", ") || "—"}
            </Row>
            <Row label="technologies">
              {diagnostic.profile.fingerprint.technologies.join(", ") || "—"}
            </Row>
            <Row label="languages">
              {diagnostic.profile.fingerprint.languages.join(", ") || "—"}
            </Row>
            <Row label="preferredWorkModels">
              {diagnostic.profile.fingerprint.preferredWorkModels.join(", ") ||
                "—"}
            </Row>
            <hr
              style={{
                margin: "10px 0",
                border: 0,
                borderTop: `1px solid ${AT.borderSoft}`,
              }}
            />
            <Row label="certifications (informativo)">
              {diagnostic.profile.informational.certifications.join(", ") ||
                "—"}
            </Row>
            <Row label="preferredContractTypes (informativo)">
              {diagnostic.profile.informational.preferredContractTypes.join(
                ", ",
              ) || "—"}
            </Row>
            <Row label="openToRelocation (informativo)">
              {String(diagnostic.profile.informational.openToRelocation)}
            </Row>
            <Row label="salaryExpectationMin (informativo)">
              {diagnostic.profile.informational.salaryExpectationMin ?? "—"}
            </Row>
          </Panel>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <Panel title="Profile matching job (MonitorProfileMatchJob)">
          {diagnostic.profileMatchJob ? (
            <>
              <Row label="status">
                <AdminPill
                  tone={
                    diagnostic.profileMatchJob.status === "FAILED"
                      ? "danger"
                      : "neutral"
                  }
                >
                  {diagnostic.profileMatchJob.status}
                </AdminPill>
              </Row>
              <Row label="attempts">{diagnostic.profileMatchJob.attempts}</Row>
              <Row label="lastError">
                {diagnostic.profileMatchJob.lastError ?? "—"}
              </Row>
              <Row label="createdAt">
                {fmt(diagnostic.profileMatchJob.createdAt)}
              </Row>
              <Row label="processedAt">
                {fmt(diagnostic.profileMatchJob.processedAt)}
              </Row>
              {diagnostic.profileMatchJob.status === "FAILED" && (
                <form
                  action={requeueProfileMatchJobAction}
                  style={{ marginTop: 8 }}
                >
                  <input
                    type="hidden"
                    name="id"
                    value={diagnostic.profileMatchJob.id}
                  />
                  <input
                    type="hidden"
                    name="redirectPath"
                    value={redirectPath}
                  />
                  <button
                    type="submit"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Reenfileirar
                  </button>
                </form>
              )}
            </>
          ) : (
            <p style={{ fontSize: 12, color: AT.muted }}>
              Nenhum job de profile matching ainda.
            </p>
          )}
          <p style={{ fontSize: 11, color: AT.muted, marginTop: 10 }}>
            <strong>Limitação conhecida:</strong> MonitorMatchJob (matching
            disparado por vaga nova) é 1 registro por VAGA, não por usuário —
            não há relação persistida entre um MonitorMatchJob e este usuário
            específico. Para saber se uma vaga específica gerou recomendação
            para ele, use a tabela de Recomendações abaixo (recommendedAt
            aproxima quando o matching rodou).
          </p>
        </Panel>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Panel title="Preferência de alerta">
          {diagnostic.alertPreference ? (
            <>
              <Row label="emailEnabled">
                {String(diagnostic.alertPreference.emailEnabled)}
              </Row>
              <Row label="frequency">
                {diagnostic.alertPreference.frequency}
              </Row>
              <Row label="unsubscribedAt">
                {fmt(diagnostic.alertPreference.unsubscribedAt)}
              </Row>
            </>
          ) : (
            <p style={{ fontSize: 12, color: AT.muted }}>
              Sem preferência configurada ainda.
            </p>
          )}
        </Panel>
      </div>

      <section style={{ marginBottom: 28 }}>
        <SectionTitle>Recomendações ({recommendations.total})</SectionTitle>
        <form method="GET" style={{ marginBottom: 10 }}>
          <AdminFilterBar>
            <select
              name="status"
              defaultValue={status ?? ""}
              style={selectStyle}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              name="opportunityLevel"
              defaultValue={opportunityLevel ?? ""}
              style={selectStyle}
            >
              <option value="">Qualquer nível</option>
              {[0, 1, 2, 3, 4, 5].map((lvl) => (
                <option key={lvl} value={lvl}>
                  Nível {lvl}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              Filtrar
            </button>
          </AdminFilterBar>
        </form>
        <AdminTable>
          <thead>
            <tr>
              <AdminTh>Vaga</AdminTh>
              <AdminTh>Empresa</AdminTh>
              <AdminTh>Score</AdminTh>
              <AdminTh>Nível</AdminTh>
              <AdminTh>Recomendada em</AdminTh>
              <AdminTh>Viewed</AdminTh>
              <AdminTh>Dismissed</AdminTh>
              <AdminTh>Superseded</AdminTh>
              <AdminTh>Saved</AdminTh>
              <AdminTh>Candidatura</AdminTh>
              <AdminTh w={70}>{null}</AdminTh>
            </tr>
          </thead>
          <tbody>
            {recommendations.items.map((rec) => (
              <tr key={rec.id}>
                <AdminTd>{rec.job.title}</AdminTd>
                <AdminTd muted>{rec.job.company.name}</AdminTd>
                <AdminTd mono>{rec.score}</AdminTd>
                <AdminTd>
                  <AdminPill
                    tone={rec.opportunityLevel >= 4 ? "ok" : "neutral"}
                  >
                    {rec.opportunityLevel}
                  </AdminPill>
                </AdminTd>
                <AdminTd mono muted>
                  {fmt(rec.recommendedAt)}
                </AdminTd>
                <AdminTd muted>{fmt(rec.viewedAt)}</AdminTd>
                <AdminTd muted>{fmt(rec.dismissedAt)}</AdminTd>
                <AdminTd muted>{fmt(rec.supersededAt)}</AdminTd>
                <AdminTd>{rec.isSaved ? "sim" : "não"}</AdminTd>
                <AdminTd muted>{rec.applicationStatus ?? "—"}</AdminTd>
                <AdminTd align="right">
                  <Link
                    href={`/admin/monitor/recomendacoes/${rec.id}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Ver
                  </Link>
                </AdminTd>
              </tr>
            ))}
            {recommendations.items.length === 0 && (
              <tr>
                <AdminTd>
                  <span style={{ color: AT.muted }}>
                    Nenhuma recomendação para este filtro.
                  </span>
                </AdminTd>
              </tr>
            )}
          </tbody>
        </AdminTable>
        <AdminPagination
          summary={`página ${recommendations.page} · ${recommendations.total} no total`}
        >
          {null}
        </AdminPagination>
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionTitle>Digests ({digests.total})</SectionTitle>
        <AdminTable>
          <thead>
            <tr>
              <AdminTh>Frequência</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Agendado para</AdminTh>
              <AdminTh>Enviado em</AdminTh>
              <AdminTh>Recomendações</AdminTh>
              <AdminTh>Eventos</AdminTh>
            </tr>
          </thead>
          <tbody>
            {digests.digests.map((d) => (
              <tr key={d.id}>
                <AdminTd>{d.frequency}</AdminTd>
                <AdminTd>
                  <AdminPill
                    tone={
                      d.status === "FAILED"
                        ? "danger"
                        : d.status === "SENT"
                          ? "ok"
                          : "neutral"
                    }
                  >
                    {d.status}
                  </AdminPill>
                </AdminTd>
                <AdminTd mono muted>
                  {fmt(d.scheduledFor)}
                </AdminTd>
                <AdminTd mono muted>
                  {fmt(d.sentAt)}
                </AdminTd>
                <AdminTd>{d.recommendations.length}</AdminTd>
                <AdminTd>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {d.events.map((e) => (
                      <AdminPill
                        key={`${e.type}-${e.occurredAt}-${e.providerMessageId}`}
                        mono
                        tone={e.type === "OPENED" ? "warn" : "neutral"}
                      >
                        {e.type}
                        {e.type === "OPENED" ? " (indicativo)" : ""}
                      </AdminPill>
                    ))}
                    {d.events.length === 0 && (
                      <span style={{ color: AT.muted, fontSize: 11 }}>—</span>
                    )}
                  </div>
                </AdminTd>
              </tr>
            ))}
            {digests.digests.length === 0 && (
              <tr>
                <AdminTd>
                  <span style={{ color: AT.muted }}>Nenhum digest ainda.</span>
                </AdminTd>
              </tr>
            )}
          </tbody>
        </AdminTable>
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionTitle>Jornada / atribuição</SectionTitle>
        <p style={{ fontSize: 11, color: AT.muted, marginBottom: 10 }}>
          {attribution.caveat}
        </p>
        <AdminTable>
          <thead>
            <tr>
              <AdminTh>Evento</AdminTh>
              <AdminTh>Quando</AdminTh>
            </tr>
          </thead>
          <tbody>
            {attribution.events.map((e) => (
              <tr key={`${e.eventName}-${e.createdAt}`}>
                <AdminTd mono>{e.eventName}</AdminTd>
                <AdminTd mono muted>
                  {fmt(e.createdAt)}
                </AdminTd>
              </tr>
            ))}
            {attribution.events.length === 0 && (
              <tr>
                <AdminTd>
                  <span style={{ color: AT.muted }}>
                    Nenhum evento registrado.
                  </span>
                </AdminTd>
              </tr>
            )}
          </tbody>
        </AdminTable>
      </section>
    </AdminPageWrap>
  );
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

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "16px 18px",
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
      {children}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 0",
        fontSize: 12.5,
        borderBottom: `1px solid ${AT.borderSoft}`,
      }}
    >
      <span style={{ color: AT.muted }}>{label}</span>
      <span style={{ color: AT.ink2, textAlign: "right" }}>{children}</span>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: "0 8px",
  borderRadius: 6,
  border: `1px solid ${AT.border}`,
  background: AT.card,
  fontSize: 12.5,
};
