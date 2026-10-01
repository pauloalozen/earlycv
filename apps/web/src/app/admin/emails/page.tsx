import Link from "next/link";

import {
  AdminCard,
  AdminPageWrap,
  AdminPill,
  AdminSectionGroup,
  AdminStatCard,
  AdminStatsRow,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import {
  type EmailDispatchKind,
  type EmailDispatchStatus,
  type EmailsOverview,
  type EmailsOverviewRange,
  type EmailsPeriod,
  getEmailsOverview,
} from "@/lib/admin-emails-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import {
  fmtDate,
  KIND_LABEL,
  MODE_LABEL,
  ModePill,
  readinessLabel,
  STATUS_LABEL,
} from "./_components/email-labels";
import { EmailsPeriodSelector } from "./_components/emails-period-selector";

export const metadata = buildAdminMetadata("Emails");

const ROOT_PATH = "/admin/emails";

const KINDS: EmailDispatchKind[] = [
  "WELCOME",
  "FEEDBACK_FIRST_USE",
  "FEEDBACK_SECOND_CALL",
  "PURCHASE_CONFIRMATION",
];
type TableRow = {
  key: string;
  label: string;
  count: (status: EmailDispatchStatus) => number;
};
const STATUSES: EmailDispatchStatus[] = [
  "PENDING",
  "SENT",
  "SKIPPED",
  "CANCELLED",
  "FAILED",
  "OUTCOME_UNKNOWN",
];

const EVENT_LABEL: Record<string, string> = {
  SENT: "Aceito pelo SES",
  DELIVERED: "Entregue",
  BOUNCED: "Bounce",
  COMPLAINED: "Complaint",
  REJECTED: "Rejeitado",
};

function fmtDay(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function Readiness({
  label,
  readiness,
}: {
  label: string;
  readiness: EmailsOverview["runtime"]["relationshipReadiness"];
}) {
  return (
    <div
      style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}
    >
      <AdminPill tone={readiness.ready ? "ok" : "warn"}>
        {readiness.ready ? "Pronto" : "Pendente"}
      </AdminPill>
      <span>
        {label}
        {readiness.ready ? "" : ` — ${readinessLabel(readiness.reason)}`}
      </span>
    </div>
  );
}

const PERIOD_IDS: EmailsPeriod[] = ["hoje", "semana", "7d", "mes", "30d"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(
  raw: Record<string, string | string[] | undefined>,
): EmailsOverviewRange {
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;
  const from = one(raw.from);
  const to = one(raw.to);
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
    return { from, to };
  }
  const period = PERIOD_IDS.find((p) => p === one(raw.period));
  return period ? { period } : {};
}

export default async function AdminEmailsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const range = parseRange(await searchParams);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", ROOT_PATH);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let overview: EmailsOverview;
  try {
    overview = await getEmailsOverview(token, range);
  } catch {
    const state = buildAdminStateModel("unexpected-error", ROOT_PATH);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { settings, runtime, counts } = overview;
  const countOf = (kind: EmailDispatchKind, status: EmailDispatchStatus) =>
    counts.byKindStatus.find((r) => r.kind === kind && r.status === status)
      ?.count ?? 0;
  const tableRows: TableRow[] = [
    {
      key: "alert",
      label: "Alerta de Vagas",
      count: (status) =>
        counts.alertDigests.find((r) => r.status === status)?.count ?? 0,
    },
    {
      key: "welcome",
      label: KIND_LABEL.WELCOME,
      count: (status) => countOf("WELCOME", status),
    },
    {
      key: "feedback",
      label: KIND_LABEL.FEEDBACK_FIRST_USE,
      count: (status) => countOf("FEEDBACK_FIRST_USE", status),
    },
    {
      key: "feedback-second-call",
      label: KIND_LABEL.FEEDBACK_SECOND_CALL,
      count: (status) => countOf("FEEDBACK_SECOND_CALL", status),
    },
    {
      key: "purchase",
      label: KIND_LABEL.PURCHASE_CONFIRMATION,
      count: (status) => countOf("PURCHASE_CONFIRMATION", status),
    },
  ];
  const eventCount = (type: string) =>
    counts.events.find((e) => e.type === type)?.count ?? 0;
  const suppressionTotal = counts.suppressions.reduce(
    (sum, s) => sum + s.count,
    0,
  );
  const configuredMode = {
    WELCOME: settings.welcomeMode,
    FEEDBACK_FIRST_USE: settings.feedbackMode,
    FEEDBACK_SECOND_CALL: settings.feedbackSecondCallMode,
    PURCHASE_CONFIRMATION: settings.purchaseConfirmationMode,
  } as const;

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Emails"
        title="Visão geral"
        subtitle="Todos os envios de e-mail da EarlyCV num só lugar: Alerta de Vagas, Product Updates, recuperação de pagamento, relacionamento e confirmação de compra."
        actions={
          <Link href={`${ROOT_PATH}/configuracoes`} style={{ fontSize: 12.5 }}>
            Configurações →
          </Link>
        }
      />

      <div
        style={{
          marginBottom: 20,
          padding: "10px 14px",
          borderRadius: 8,
          fontSize: 12.5,
          background: runtime.transport === "fake" ? AT.infoBg : AT.okBg,
          color: runtime.transport === "fake" ? AT.info : AT.ok,
          border: `1px solid ${runtime.transport === "fake" ? "rgba(46,90,138,0.2)" : "rgba(31,122,77,0.2)"}`,
        }}
      >
        {runtime.transport === "fake"
          ? "Transporte fake: neste ambiente nada sai pela rede — os envios do dispatch só são simulados (linhas ficam como enviadas com id fake)."
          : "Transporte real (produção): os envios ligados saem de verdade."}
      </div>

      <AdminSectionGroup label="Ativação dos novos envios">
        <AdminStatsRow cols={4}>
          {KINDS.map((kind) => {
            const effective = runtime.effectiveModes[kind];
            const configured = configuredMode[kind];
            return (
              <AdminCard key={kind}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  {KIND_LABEL[kind]}
                </div>
                <ModePill mode={effective} />
                {configured !== effective ? (
                  <p style={{ fontSize: 12, color: AT.muted, marginTop: 8 }}>
                    Configurado como {MODE_LABEL[configured]}; efetivo{" "}
                    {MODE_LABEL[effective]} (
                    {!settings.startAt ? "sem cutoff" : "fora de produção"}).
                  </p>
                ) : null}
              </AdminCard>
            );
          })}
        </AdminStatsRow>
        <AdminCard>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13 }}>
              <strong>Cutoff:</strong>{" "}
              {settings.startAt
                ? `só cadastros/compras a partir de ${fmtDate(settings.startAt)}`
                : "não definido — nenhum envio roda e a base antiga nunca recebe"}
            </div>
            <Readiness
              label="Relacionamento (SES)"
              readiness={runtime.relationshipReadiness}
            />
            <Readiness
              label="Confirmação de compra (Resend)"
              readiness={runtime.purchaseReadiness}
            />
          </div>
        </AdminCard>
      </AdminSectionGroup>

      <AdminSectionGroup label="Saúde">
        <AdminStatsRow cols={3}>
          <AdminStatCard
            label="Compras sem recibo (24h)"
            value={String(counts.missingPurchaseConfirmations)}
            sub={
              counts.missingPurchaseConfirmations > 0
                ? "Ver na aba Compras"
                : "Nenhuma pendência"
            }
            href={`${ROOT_PATH}/compras`}
          />
          <AdminStatCard
            label="Endereços suprimidos"
            value={String(suppressionTotal)}
            sub="Hard bounce + complaint (todas as categorias)"
            href={`${ROOT_PATH}/supressoes`}
          />
          <AdminStatCard
            label={`Entregas (${counts.eventsWindowDays} dias)`}
            value={String(eventCount("DELIVERED"))}
            sub={`${eventCount("BOUNCED")} bounce · ${eventCount("COMPLAINED")} complaint`}
          />
        </AdminStatsRow>
      </AdminSectionGroup>

      <AdminSectionGroup
        label={
          counts.window.fromDate === counts.window.toDate
            ? `Envios em ${fmtDay(counts.window.fromDate)}`
            : `Envios de ${fmtDay(counts.window.fromDate)} a ${fmtDay(counts.window.toDate)}`
        }
      >
        <AdminCard>
          <EmailsPeriodSelector
            basePath={ROOT_PATH}
            period={counts.window.period}
            fromDate={counts.window.fromDate}
            toDate={counts.window.toDate}
          />
          <AdminTable>
            <thead>
              <tr>
                <AdminTh>Tipo</AdminTh>
                {STATUSES.map((status) => (
                  <AdminTh key={status} align="right">
                    {STATUS_LABEL[status]}
                  </AdminTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.key}>
                  <AdminTd>{row.label}</AdminTd>
                  {STATUSES.map((status) => (
                    <AdminTd key={status} align="right">
                      {row.count(status)}
                    </AdminTd>
                  ))}
                </tr>
              ))}
            </tbody>
          </AdminTable>
          <p style={{ fontSize: 12, color: AT.muted, marginTop: 10 }}>
            Não inclui envios de teste. O Alerta de Vagas conta digests (o
            status Cancelado não existe nele). Eventos de entrega dos últimos{" "}
            {counts.eventsWindowDays} dias:{" "}
            {counts.events.length === 0
              ? "nenhum"
              : counts.events
                  .map((e) => `${EVENT_LABEL[e.type] ?? e.type}: ${e.count}`)
                  .join(" · ")}
            . Product Updates e recuperação de pagamento têm suas próprias
            métricas nas respectivas abas.
          </p>
        </AdminCard>
      </AdminSectionGroup>
    </AdminPageWrap>
  );
}
