import { notFound } from "next/navigation";

import {
  AdminPageWrap,
  AdminPill,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import { getAdminMonitorJobDiagnostic } from "@/lib/admin-monitor-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { buttonVariants } from "../../../_components/admin-button";
import { requeueMatchJobAction } from "../../actions";

export const metadata = buildAdminMetadata("Vaga — Meu Monitor");

type PageProps = { params: Promise<{ jobId: string }> };

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export default async function AdminMonitorJobPage({ params }: PageProps) {
  const { jobId } = await params;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/monitor/vagas/${jobId}`,
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let diagnostic: Awaited<ReturnType<typeof getAdminMonitorJobDiagnostic>>;
  try {
    diagnostic = await getAdminMonitorJobDiagnostic(jobId, token);
  } catch (err) {
    if (err instanceof Error && err.message.includes("API 404")) {
      notFound();
    }
    const state = buildAdminStateModel(
      "unexpected-error",
      `/admin/monitor/vagas/${jobId}`,
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const redirectPath = `/admin/monitor/vagas/${jobId}`;
  const stats = diagnostic.recommendationStats;

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Meu Monitor · Diagnóstico de vaga"
        title={diagnostic.job.title}
        subtitle={`${diagnostic.job.company.name} · jobId ${diagnostic.job.id} · captada em ${fmt(diagnostic.job.firstSeenAt)}`}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Panel title="Job">
          <Row label="status">{diagnostic.job.status}</Row>
          <Row label="slug">{diagnostic.job.slug ?? "—"}</Row>
          <Row label="firstSeenAt">{fmt(diagnostic.job.firstSeenAt)}</Row>
          <Row label="publishedAtSource">
            {fmt(diagnostic.job.publishedAtSource)}
          </Row>
        </Panel>

        <Panel title="JobEnrichment">
          {diagnostic.enrichment ? (
            <>
              <Row label="enrichmentStatus">
                <AdminPill
                  tone={
                    diagnostic.enrichment.enrichmentStatus === "COMPLETED"
                      ? "ok"
                      : "warn"
                  }
                >
                  {String(diagnostic.enrichment.enrichmentStatus)}
                </AdminPill>
              </Row>
              <Row label="dominantArea">
                {String(diagnostic.enrichment.dominantArea ?? "—")}
              </Row>
              <Row label="seniority">
                {String(diagnostic.enrichment.seniority ?? "—")}
              </Row>
              <Row label="requiredSkills">
                {Array.isArray(diagnostic.enrichment.requiredSkills)
                  ? (diagnostic.enrichment.requiredSkills as string[]).join(
                      ", ",
                    ) || "—"
                  : "—"}
              </Row>
              <Row label="technologies">
                {Array.isArray(diagnostic.enrichment.technologies)
                  ? (diagnostic.enrichment.technologies as string[]).join(
                      ", ",
                    ) || "—"
                  : "—"}
              </Row>
            </>
          ) : (
            <p style={{ fontSize: 12, color: AT.muted }}>
              Sem enrichment ainda.
            </p>
          )}
        </Panel>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Panel title="MonitorMatchJob (matching desta vaga contra os perfis candidatos)">
          {diagnostic.matchJob ? (
            <>
              <Row label="status">
                <AdminPill
                  tone={
                    diagnostic.matchJob.status === "FAILED"
                      ? "danger"
                      : "neutral"
                  }
                >
                  {diagnostic.matchJob.status}
                </AdminPill>
              </Row>
              <Row label="attempts">{diagnostic.matchJob.attempts}</Row>
              <Row label="lastError">
                {diagnostic.matchJob.lastError ?? "—"}
              </Row>
              <Row label="matchedCount">
                {diagnostic.matchJob.matchedCount ?? "—"}
              </Row>
              <Row label="processedAt">
                {fmt(diagnostic.matchJob.processedAt)}
              </Row>
              {diagnostic.matchJob.status === "FAILED" && (
                <form action={requeueMatchJobAction} style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={jobId} />
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
              Nenhum MonitorMatchJob ainda.
            </p>
          )}
        </Panel>
      </div>

      <section>
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
          Esta vaga entrou para quem e por quê
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <StatBox label="Total de recomendações" value={stats.total} />
          <StatBox label="Nível 3+" value={stats.level3Plus} />
          <StatBox label="Visualizaram" value={stats.viewed} />
          <StatBox label="Ignoraram (dismissed)" value={stats.dismissed} />
          <StatBox label="Salvaram" value={stats.saved} />
          <StatBox
            label="Iniciaram candidatura"
            value={stats.applicationsStarted}
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["0", "1", "2", "3", "4", "5"] as const).map((lvl) => (
            <AdminPill
              key={lvl}
              mono
              tone={Number(lvl) >= 3 ? "ok" : "neutral"}
            >
              nível {lvl}: {stats.byOpportunityLevel[lvl]}
            </AdminPill>
          ))}
        </div>
      </section>
    </AdminPageWrap>
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

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: AT.muted2,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{ fontSize: 22, fontWeight: 500, color: AT.ink, marginTop: 4 }}
      >
        {value}
      </div>
    </div>
  );
}
