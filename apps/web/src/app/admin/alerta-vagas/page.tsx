import Link from "next/link";
import {
  AdminCard,
  AdminFilterBar,
  AdminPageWrap,
  AdminPagination,
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
  type AlertRolloutPolicy,
  type DigestContent,
  type DigestEmailStats,
  type DigestFrequency,
  type DigestHistoryItem,
  type DigestSchedule,
  type DigestUnsubscribeItem,
  type DigestUnsubscribeReason,
  type EmailBulkSendMode,
  type EmailProviderName,
  getAlertRolloutPolicy,
  getMonitorDigestContent,
  getMonitorDigestHistory,
  getMonitorDigestSchedule,
  getMonitorDigestStats,
  getMonitorDigestUnsubscribes,
  listTrackedAlertUsers,
  type MonitorDigestEventType,
  type MonitorDigestStatus,
  type SesRolloutSegment,
  type TrackedAlertUser,
} from "@/lib/admin-monitor-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { buttonVariants } from "../_components/admin-button";
import { AlertRolloutSection } from "./_components/alert-rollout-section";
import { TrackUserCombobox } from "./_components/track-user-combobox";
import {
  resendDigestAction,
  sendDigestNowAction,
  setAlertPreferenceAction,
  updateDigestContentAction,
  updateDigestScheduleAction,
} from "./actions";

export const metadata = buildAdminMetadata("Alerta de Vagas");

const ROOT_PATH = "/admin/alerta-vagas";

const FREQUENCY_OPTIONS: { value: DigestFrequency; label: string }[] = [
  { value: "DAILY", label: "Diário" },
  { value: "EVERY_2_DAYS", label: "A cada 2 dias" },
  { value: "EVERY_3_DAYS", label: "A cada 3 dias" },
  { value: "EVERY_4_DAYS", label: "A cada 4 dias" },
  { value: "WEEKLY", label: "Semanal" },
];

const SES_MODE_LABEL: Record<EmailBulkSendMode, string> = {
  LEGACY_RESEND: "Resend (padrão atual)",
  SES_ROLLOUT: "SES — só a coorte abaixo",
  SES_LIVE: "SES — todo mundo elegível",
  PAUSED: "Pausado — ninguém recebe",
};

const SES_MODE_OPTIONS: { value: EmailBulkSendMode; label: string }[] = [
  { value: "LEGACY_RESEND", label: SES_MODE_LABEL.LEGACY_RESEND },
  { value: "SES_ROLLOUT", label: SES_MODE_LABEL.SES_ROLLOUT },
  { value: "SES_LIVE", label: SES_MODE_LABEL.SES_LIVE },
  { value: "PAUSED", label: SES_MODE_LABEL.PAUSED },
];

const SES_SEGMENT_OPTIONS: { value: SesRolloutSegment; label: string }[] = [
  { value: "INTERNAL", label: "Só time interno (admin/superadmin)" },
  { value: "PAID", label: "Quem já pagou algum plano" },
  { value: "ALL", label: "Toda a base elegível" },
];

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

const STATUS_TONE: Record<
  string,
  "ok" | "danger" | "warn" | "info" | "neutral"
> = {
  SENT: "ok",
  FAILED: "danger",
  SKIPPED: "warn",
  PENDING: "info",
  PROCESSING: "info",
  OUTCOME_UNKNOWN: "warn",
};

const PROVIDER_LABEL: Record<EmailProviderName, string> = {
  RESEND: "Resend",
  SES: "SES",
};

const REASON_LABEL: Record<string, string> = {
  USER_UNSUBSCRIBED: "descadastro voluntário",
  BOUNCED: "suprimido · bounce",
  COMPLAINED: "suprimido · complaint",
  SUPPRESSED: "suprimidos (bounce/complaint)",
};

const EVENT_LABEL: Record<string, string> = {
  SENT: "aceito",
  DELIVERED: "entregue",
  OPENED: "aberto",
  CLICKED: "clicado",
  BOUNCED: "bounce",
  COMPLAINED: "complaint",
  REJECTED: "rejeitado",
};

const PERIOD_OPTIONS = [
  { value: "1", label: "24h" },
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
];

function fmtRate(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

type SearchParams = Promise<{
  query?: string;
  historyQuery?: string;
  historySource?: string;
  historyProvider?: string;
  historyStatus?: string;
  // Drill-down por card (ver AdminStatCard href abaixo): eventType filtra
  // por evento de webhook (Entregues/Abertos/Clicados/Rejeitados/Bounces/
  // Complaints), view alterna pra listagem de descadastros (fonte de dados
  // diferente, não é um MonitorDigest), from é a janela do card (mesma
  // usada pelo periodDays dos cards, fixada no momento do clique pra não
  // mudar conforme o tempo passa navegando entre páginas), page pagina a
  // listagem ativa (digest ou descadastro).
  historyEventType?: string;
  historyView?: string;
  // Filtro de motivo dentro da view "unsubscribed" — USER_UNSUBSCRIBED
  // (descadastro voluntário), BOUNCED, COMPLAINED, ou SUPPRESSED (atalho
  // pra BOUNCED+COMPLAINED juntos, usado pelo card "Suprimidos").
  historyReason?: string;
  historyFrom?: string;
  historyPage?: string;
  periodDays?: string;
  statsProvider?: string;
  status?: string;
  message?: string;
}>;

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function buildRedirectPath(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const suffix = qs.toString();
  return suffix ? `${ROOT_PATH}?${suffix}` : ROOT_PATH;
}

function StatusBanner({
  status,
  message,
}: {
  status?: string;
  message?: string;
}) {
  if (!message) return null;
  const isSuccess = status === "success";
  return (
    <div
      style={{
        marginBottom: 20,
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 12.5,
        background: isSuccess ? AT.okBg : AT.dangerBg,
        color: isSuccess ? AT.ok : AT.danger,
        border: `1px solid ${isSuccess ? "rgba(31,122,77,0.2)" : "rgba(155,44,44,0.2)"}`,
      }}
    >
      {message}
    </div>
  );
}

export default async function AdminAlertaVagasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const {
    query,
    historyQuery,
    historySource,
    historyProvider,
    historyStatus,
    historyEventType,
    historyView,
    historyReason,
    historyFrom,
    historyPage,
    periodDays,
    statsProvider,
    status,
    message,
  } = await searchParams;
  const token = await getBackofficeSessionToken();

  const parsedPeriodDays =
    periodDays === "1" ||
    periodDays === "7" ||
    periodDays === "30" ||
    periodDays === "90"
      ? Number(periodDays)
      : 1;
  const parsedStatsProvider =
    statsProvider === "RESEND" || statsProvider === "SES"
      ? statsProvider
      : undefined;
  const parsedHistoryProvider =
    historyProvider === "RESEND" || historyProvider === "SES"
      ? historyProvider
      : undefined;
  const parsedHistoryStatus: MonitorDigestStatus | undefined = (
    [
      "PENDING",
      "PROCESSING",
      "SENT",
      "FAILED",
      "SKIPPED",
      "OUTCOME_UNKNOWN",
    ] as const
  ).includes(historyStatus as MonitorDigestStatus)
    ? (historyStatus as MonitorDigestStatus)
    : undefined;
  const EVENT_TYPE_FILTERS = [
    "DELIVERED",
    "OPENED",
    "CLICKED",
    "BOUNCED",
    "COMPLAINED",
    "REJECTED",
  ] as const;
  const parsedHistoryEventType: MonitorDigestEventType | undefined =
    EVENT_TYPE_FILTERS.includes(
      historyEventType as (typeof EVENT_TYPE_FILTERS)[number],
    )
      ? (historyEventType as (typeof EVENT_TYPE_FILTERS)[number])
      : undefined;
  const historyViewIsUnsubscribed = historyView === "unsubscribed";
  const REASON_FILTERS = [
    "USER_UNSUBSCRIBED",
    "BOUNCED",
    "COMPLAINED",
    "SUPPRESSED",
  ] as const;
  const parsedHistoryReason:
    | DigestUnsubscribeReason
    | "SUPPRESSED"
    | undefined = REASON_FILTERS.includes(
    historyReason as (typeof REASON_FILTERS)[number],
  )
    ? (historyReason as (typeof REASON_FILTERS)[number])
    : undefined;
  const parsedHistoryFrom =
    historyFrom && !Number.isNaN(Date.parse(historyFrom))
      ? historyFrom
      : undefined;
  const parsedHistoryPage =
    historyPage && Number(historyPage) > 0
      ? Math.floor(Number(historyPage))
      : 1;

  if (!token) {
    const state = buildAdminStateModel("missing-token", ROOT_PATH);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let trackedUsers: { total: number; users: TrackedAlertUser[] };
  let history: {
    page: number;
    limit: number;
    total: number;
    items: DigestHistoryItem[];
  };
  let stats: DigestEmailStats;
  let schedule: DigestSchedule;
  let content: DigestContent;
  let rolloutPolicy: AlertRolloutPolicy;
  let unsubscribes: {
    page: number;
    limit: number;
    total: number;
    items: DigestUnsubscribeItem[];
  } | null;
  try {
    [
      trackedUsers,
      history,
      stats,
      schedule,
      content,
      rolloutPolicy,
      unsubscribes,
    ] = await Promise.all([
      listTrackedAlertUsers({ query, limit: 20 }, token),
      getMonitorDigestHistory(
        {
          userQuery: historyQuery,
          source:
            historySource === "MANUAL" || historySource === "AUTOMATIC"
              ? historySource
              : undefined,
          provider: parsedHistoryProvider,
          status: parsedHistoryStatus,
          eventType: parsedHistoryEventType,
          from: parsedHistoryFrom,
          page: parsedHistoryPage,
          limit: 20,
        },
        token,
      ),
      getMonitorDigestStats(
        { periodDays: parsedPeriodDays, provider: parsedStatsProvider },
        token,
      ),
      getMonitorDigestSchedule(token),
      getMonitorDigestContent(token),
      getAlertRolloutPolicy(token),
      historyViewIsUnsubscribed
        ? getMonitorDigestUnsubscribes(
            {
              from: parsedHistoryFrom,
              page: parsedHistoryPage,
              limit: 20,
              reason: parsedHistoryReason,
            },
            token,
          )
        : Promise.resolve(null),
    ]);
  } catch {
    const state = buildAdminStateModel("unexpected-error", ROOT_PATH);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const currentHistoryParams = {
    query,
    historyQuery,
    historySource,
    historyProvider,
    historyStatus,
    historyEventType,
    historyView,
    historyReason,
    historyFrom,
    periodDays,
    statsProvider,
  };
  const currentRedirectPath = buildRedirectPath(currentHistoryParams);
  // Janela do card no momento do clique — fixa em ISO pra não recalcular a
  // cada navegação de página dentro do mesmo drill-down (ver comentário no
  // SearchParams.historyFrom).
  const cardWindowFrom = new Date(
    Date.now() - parsedPeriodDays * 24 * 60 * 60_000,
  ).toISOString();
  function cardHref(overrides: {
    historyStatus?: MonitorDigestStatus;
    historyEventType?: MonitorDigestEventType;
    historyView?: "unsubscribed";
    historyReason?: DigestUnsubscribeReason | "SUPPRESSED";
  }) {
    return buildRedirectPath({
      periodDays,
      statsProvider,
      historyProvider: statsProvider,
      historyFrom: cardWindowFrom,
      ...overrides,
    });
  }
  function historyPageHref(page: number) {
    return buildRedirectPath({
      ...currentHistoryParams,
      historyPage: String(page),
    });
  }

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Radar Oportunidades"
        title="Alerta de Vagas"
        subtitle="Gestão operacional do Alerta de Vaga Certa: elegibilidade, disparo manual, histórico, agendamento, modo de envio e conteúdo do e-mail."
      />

      <StatusBanner status={status} message={message} />

      <AdminSectionGroup label="Operação">
        <AlertRolloutSection
          policy={rolloutPolicy}
          redirectPath={currentRedirectPath}
        />

        {/* ── Elegibilidade e disparo manual ───────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeading
            title="Elegibilidade e disparo manual"
            description='Acesso ao Alerta é aberto pra toda a base — o e-mail é o interruptor que o próprio usuário controla, e a cadência é global (definida em Agendamento). "Liberação manual" ainda não decide nada — a coluna já está pronta pra quando existir uma regra comercial de elegibilidade. "Disparar agora" envia o digest desse usuário na hora, de forma síncrona, pelo caminho definido em Modo de envio.'
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <form method="GET">
              <AdminFilterBar>
                <input
                  type="text"
                  name="query"
                  defaultValue={query}
                  placeholder="Buscar por nome ou e-mail"
                  style={inputStyle}
                />
                <button
                  type="submit"
                  className={buttonVariants({ size: "sm" })}
                >
                  Buscar
                </button>
              </AdminFilterBar>
            </form>
            <TrackUserCombobox redirectPath={currentRedirectPath} />
          </div>

          <AdminTable>
            <thead>
              <tr>
                <AdminTh>Usuário</AdminTh>
                <AdminTh>Papel</AdminTh>
                <AdminTh>Elegível hoje</AdminTh>
                <AdminTh>E-mail</AdminTh>
                <AdminTh>Liberação manual</AdminTh>
                <AdminTh align="right">Ação</AdminTh>
              </tr>
            </thead>
            <tbody>
              {trackedUsers.users.map((user) => {
                const canSend = user.entitledToday && user.emailEnabled;
                return (
                  <tr key={user.id}>
                    <AdminTd>
                      <div style={{ fontSize: 13, color: AT.ink2 }}>
                        {user.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: AT.muted2,
                          fontFamily: '"Geist Mono", monospace',
                        }}
                      >
                        {user.email}
                      </div>
                    </AdminTd>
                    <AdminTd>
                      <AdminPill
                        tone={user.internalRole === "none" ? "neutral" : "dark"}
                      >
                        {user.internalRole === "none"
                          ? "usuário"
                          : user.internalRole}
                      </AdminPill>
                    </AdminTd>
                    <AdminTd>
                      <AdminPill tone={user.entitledToday ? "ok" : "danger"}>
                        {user.entitledToday ? "sim" : "não"}
                      </AdminPill>
                    </AdminTd>
                    <AdminTd>
                      <AdminPill tone={user.emailEnabled ? "ok" : "neutral"}>
                        {user.emailEnabled ? "ativado" : "desativado"}
                      </AdminPill>
                    </AdminTd>
                    <AdminTd>
                      <AdminPill tone="warn">em breve</AdminPill>
                    </AdminTd>
                    <AdminTd align="right">
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          justifyContent: "flex-end",
                        }}
                      >
                        <form action={setAlertPreferenceAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="emailEnabled"
                            value={String(!user.emailEnabled)}
                          />
                          <input
                            type="hidden"
                            name="redirectPath"
                            value={currentRedirectPath}
                          />
                          <button
                            type="submit"
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                          >
                            {user.emailEnabled ? "Desativar" : "Ativar"}
                          </button>
                        </form>
                        <form action={sendDigestNowAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="redirectPath"
                            value={currentRedirectPath}
                          />
                          <button
                            type="submit"
                            disabled={!canSend}
                            className={buttonVariants({ size: "sm" })}
                            title={
                              canSend
                                ? undefined
                                : "Usuário não é elegível hoje"
                            }
                          >
                            Disparar agora →
                          </button>
                        </form>
                      </div>
                    </AdminTd>
                  </tr>
                );
              })}
              {trackedUsers.users.length === 0 && (
                <tr>
                  <AdminTd>
                    <span style={{ color: AT.muted }}>
                      Nenhum usuário incluído ainda — use "Incluir usuário"
                      acima.
                    </span>
                  </AdminTd>
                </tr>
              )}
            </tbody>
          </AdminTable>
          <AdminPagination summary={`${trackedUsers.total} usuário(s)`}>
            {null}
          </AdminPagination>
        </section>

        {/* ── Histórico de envios ─────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeading
            title="Histórico de envios"
            description="Todos os digests já processados, manuais e automáticos, com o provider real de envio (Resend ou SES) — dado histórico do Resend é preservado, nunca recalculado ou descartado."
          />

          <form method="GET" style={{ marginBottom: 14 }}>
            <input type="hidden" name="query" value={query ?? ""} />
            <input
              type="hidden"
              name="historyQuery"
              value={historyQuery ?? ""}
            />
            <input
              type="hidden"
              name="historySource"
              value={historySource ?? ""}
            />
            <input
              type="hidden"
              name="historyProvider"
              value={historyProvider ?? ""}
            />
            <input
              type="hidden"
              name="historyStatus"
              value={historyStatus ?? ""}
            />
            <AdminFilterBar>
              <span style={{ fontSize: 11, color: AT.muted }}>Período:</span>
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="submit"
                  name="periodDays"
                  value={option.value}
                  className={buttonVariants({
                    size: "sm",
                    variant:
                      parsedPeriodDays === Number(option.value)
                        ? "default"
                        : "outline",
                  })}
                >
                  {option.label}
                </button>
              ))}
              <span style={{ fontSize: 11, color: AT.muted, marginLeft: 10 }}>
                Provider:
              </span>
              <select
                name="statsProvider"
                defaultValue={statsProvider ?? ""}
                style={inputStyle}
              >
                <option value="">Todos</option>
                <option value="RESEND">Resend</option>
                <option value="SES">SES</option>
              </select>
              <button type="submit" className={buttonVariants({ size: "sm" })}>
                Filtrar
              </button>
            </AdminFilterBar>
          </form>

          <AdminStatsRow cols={4}>
            <AdminStatCard
              label="Processados"
              value={String(stats.summary.processed)}
              tooltip="Digests que entraram no funil de envio neste período (inclui os que ainda falharam ou foram pulados). Clique pra ver a lista."
              href={cardHref({})}
            />
            <AdminStatCard
              label="Aceitos pelo provider"
              value={String(stats.summary.accepted)}
              tooltip="Envios que o provider (Resend ou SES) aceitou processar, antes de qualquer confirmação de entrega. Clique pra ver a lista."
              href={cardHref({ historyStatus: "SENT" })}
            />
            <AdminStatCard
              label="Entregues"
              value={String(stats.summary.delivered)}
              sub={fmtRate(stats.summary.rates.deliveryRate)}
              tooltip="Taxa de entrega = entregues / aceitos pelo provider. Clique pra ver a lista."
              href={cardHref({ historyEventType: "DELIVERED" })}
            />
            <AdminStatCard
              label="Abertos (únicos)"
              value={String(stats.summary.openedUnique)}
              sub={fmtRate(stats.summary.rates.openRate)}
              tooltip="Taxa de abertura = abertos únicos / entregues. Pode estar inflada: o Apple Mail Privacy Protection pré-carrega o pixel de rastreio mesmo sem abertura real pelo usuário. Clique pra ver a lista."
              href={cardHref({ historyEventType: "OPENED" })}
            />
            <AdminStatCard
              label="Clicados (únicos)"
              value={String(stats.summary.clickedUnique)}
              sub={fmtRate(stats.summary.rates.clickRate)}
              tooltip="Taxa de clique = clicados únicos / entregues. Clique pra ver a lista."
              href={cardHref({ historyEventType: "CLICKED" })}
            />
            <AdminStatCard
              label="Rejeitados pelo provider"
              value={String(stats.summary.rejected)}
              tooltip="Rejeitado pelo provider antes da entrega (ex.: filtro de conteúdo/spam do SES) — nunca chegou a ser entregue. Clique pra ver a lista."
              href={cardHref({ historyEventType: "REJECTED" })}
            />
            <AdminStatCard
              label="Bounces"
              value={String(stats.summary.bounced)}
              sub={fmtRate(stats.summary.rates.bounceRate)}
              tooltip="Taxa de bounce = bounces / aceitos pelo provider. Clique pra ver a lista."
              href={cardHref({ historyEventType: "BOUNCED" })}
            />
            <AdminStatCard
              label="Complaints"
              value={String(stats.summary.complained)}
              sub={fmtRate(stats.summary.rates.complaintRate)}
              tooltip="Taxa de complaint = complaints / entregues. Clique pra ver a lista."
              href={cardHref({ historyEventType: "COMPLAINED" })}
            />
            <AdminStatCard
              label="Falharam"
              value={String(stats.summary.failed)}
              tooltip="Erro confirmado do provider antes de aceitar o envio (esgotou as tentativas). Clique pra ver a lista."
              href={cardHref({ historyStatus: "FAILED" })}
            />
            <AdminStatCard
              label="Resultado desconhecido"
              value={String(stats.summary.outcomeUnknown)}
              tooltip="Timeout ou erro de rede ambíguo — aguardando confirmação assíncrona do provider antes de decidir sucesso ou falha. Clique pra ver a lista."
              href={cardHref({ historyStatus: "OUTCOME_UNKNOWN" })}
            />
            <AdminStatCard
              label="Descadastros"
              value={String(stats.summary.unsubscribed)}
              tooltip="Usuários com o Alerta desativado neste período, por qualquer motivo (cancelamento voluntário ou supressão automática por bounce/complaint). Clique pra ver a lista."
              href={cardHref({ historyView: "unsubscribed" })}
            />
            <AdminStatCard
              label="Suprimidos (bounce/complaint)"
              value={String(stats.summary.suppressed)}
              tooltip="Fatia de Descadastros que NÃO foi cancelamento voluntário — o sistema desativou o e-mail sozinho porque o provider reportou bounce ou complaint (higiene de lista automática, protege a reputação do domínio de envio). Clique pra ver a lista."
              href={cardHref({
                historyView: "unsubscribed",
                historyReason: "SUPPRESSED",
              })}
            />
          </AdminStatsRow>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            {Object.entries(stats.byProvider).map(([provider, count]) => (
              <AdminPill key={provider} tone="dark" mono>
                {PROVIDER_LABEL[provider as EmailProviderName] ?? provider}:{" "}
                {count}
              </AdminPill>
            ))}
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <AdminPill
                key={status}
                tone={STATUS_TONE[status] ?? "neutral"}
                mono
              >
                {status}: {count}
              </AdminPill>
            ))}
            {stats.stuckProcessing > 0 && (
              <AdminPill tone="warn">
                {stats.stuckProcessing} preso(s) em PROCESSING
              </AdminPill>
            )}
            {stats.outcomeUnknownDigests.length > 0 && (
              <AdminPill tone="warn">
                {stats.outcomeUnknownDigests.length} em OUTCOME_UNKNOWN
                (esgotaram tentativas)
              </AdminPill>
            )}
          </div>

          {(historyEventType || historyViewIsUnsubscribed) && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 14,
                fontSize: 12,
                color: AT.muted,
              }}
            >
              <AdminPill tone="info">
                Filtro do card:{" "}
                {historyViewIsUnsubscribed
                  ? (REASON_LABEL[historyReason ?? ""] ?? "Descadastros")
                  : (EVENT_LABEL[historyEventType ?? ""] ?? historyEventType)}
              </AdminPill>
              <Link
                href={buildRedirectPath({ periodDays, statsProvider })}
                style={{ color: AT.info }}
              >
                Limpar filtro
              </Link>
            </div>
          )}

          {historyViewIsUnsubscribed ? (
            <>
              <AdminTable>
                <thead>
                  <tr>
                    <AdminTh>Data/hora</AdminTh>
                    <AdminTh>Usuário</AdminTh>
                    <AdminTh>Motivo</AdminTh>
                  </tr>
                </thead>
                <tbody>
                  {(unsubscribes?.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <AdminTd mono>{fmtDate(item.unsubscribedAt)}</AdminTd>
                      <AdminTd>
                        <div style={{ fontSize: 13, color: AT.ink2 }}>
                          {item.user.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: AT.muted2,
                            fontFamily: '"Geist Mono", monospace',
                          }}
                        >
                          {item.user.email}
                        </div>
                      </AdminTd>
                      <AdminTd>
                        <AdminPill
                          tone={
                            item.suppressionReason === "USER_UNSUBSCRIBED"
                              ? "neutral"
                              : item.suppressionReason
                                ? "warn"
                                : "neutral"
                          }
                        >
                          {item.suppressionReason
                            ? (REASON_LABEL[item.suppressionReason] ??
                              item.suppressionReason)
                            : "motivo desconhecido (anterior)"}
                        </AdminPill>
                      </AdminTd>
                    </tr>
                  ))}
                  {(unsubscribes?.items.length ?? 0) === 0 && (
                    <tr>
                      <AdminTd>
                        <span style={{ color: AT.muted }}>
                          Nenhum descadastro neste período.
                        </span>
                      </AdminTd>
                    </tr>
                  )}
                </tbody>
              </AdminTable>
              <AdminPagination
                summary={`${unsubscribes?.total ?? 0} descadastro(s) · página ${unsubscribes?.page ?? 1} de ${Math.max(1, Math.ceil((unsubscribes?.total ?? 0) / (unsubscribes?.limit ?? 20)))}`}
              >
                {(unsubscribes?.page ?? 1) > 1 && (
                  <Link
                    href={historyPageHref((unsubscribes?.page ?? 1) - 1)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Anterior
                  </Link>
                )}
                {(unsubscribes?.page ?? 1) * (unsubscribes?.limit ?? 20) <
                  (unsubscribes?.total ?? 0) && (
                  <Link
                    href={historyPageHref((unsubscribes?.page ?? 1) + 1)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Próxima
                  </Link>
                )}
              </AdminPagination>
            </>
          ) : (
            <>
              <form method="GET" style={{ marginBottom: 14 }}>
                <input type="hidden" name="query" value={query ?? ""} />
                <input
                  type="hidden"
                  name="periodDays"
                  value={periodDays ?? ""}
                />
                <input
                  type="hidden"
                  name="statsProvider"
                  value={statsProvider ?? ""}
                />
                <AdminFilterBar>
                  <input
                    type="text"
                    name="historyQuery"
                    defaultValue={historyQuery}
                    placeholder="Buscar por usuário"
                    style={inputStyle}
                  />
                  <select
                    name="historySource"
                    defaultValue={historySource ?? ""}
                    style={inputStyle}
                  >
                    <option value="">Forma de envio: todas</option>
                    <option value="MANUAL">Manual</option>
                    <option value="AUTOMATIC">Automático</option>
                  </select>
                  <select
                    name="historyProvider"
                    defaultValue={historyProvider ?? ""}
                    style={inputStyle}
                  >
                    <option value="">Provider: todos</option>
                    <option value="RESEND">Resend</option>
                    <option value="SES">SES</option>
                  </select>
                  <select
                    name="historyStatus"
                    defaultValue={historyStatus ?? ""}
                    style={inputStyle}
                  >
                    <option value="">Status: todos</option>
                    <option value="SENT">Enviado</option>
                    <option value="FAILED">Falhou</option>
                    <option value="OUTCOME_UNKNOWN">
                      Resultado desconhecido
                    </option>
                    <option value="SKIPPED">Sem elegíveis</option>
                    <option value="PENDING">Pendente</option>
                    <option value="PROCESSING">Processando</option>
                  </select>
                  <button
                    type="submit"
                    className={buttonVariants({ size: "sm" })}
                  >
                    Filtrar
                  </button>
                </AdminFilterBar>
              </form>

              <AdminTable>
                <thead>
                  <tr>
                    <AdminTh>Data/hora</AdminTh>
                    <AdminTh>Usuário</AdminTh>
                    <AdminTh>Provider</AdminTh>
                    <AdminTh>Forma de envio</AdminTh>
                    <AdminTh>Status</AdminTh>
                    <AdminTh>Último evento</AdminTh>
                    <AdminTh align="right">Ação</AdminTh>
                  </tr>
                </thead>
                <tbody>
                  {history.items.map((item) => (
                    <tr key={item.id}>
                      <AdminTd mono>
                        {fmtDate(item.sentAt ?? item.createdAt)}
                      </AdminTd>
                      <AdminTd>
                        <Link
                          href={`/admin/alerta-vagas/digest/${item.id}`}
                          style={{ textDecoration: "none" }}
                        >
                          <div style={{ fontSize: 13, color: AT.ink2 }}>
                            {item.user.name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: AT.muted2,
                              fontFamily: '"Geist Mono", monospace',
                            }}
                          >
                            {item.user.email}
                          </div>
                        </Link>
                      </AdminTd>
                      <AdminTd>
                        <AdminPill tone="dark" mono>
                          {PROVIDER_LABEL[item.provider]}
                        </AdminPill>
                      </AdminTd>
                      <AdminTd>
                        <AdminPill
                          tone={
                            item.source === "ADMIN_MANUAL" ? "info" : "neutral"
                          }
                        >
                          {item.source === "ADMIN_MANUAL"
                            ? `manual · ${item.triggeredByAdmin?.name ?? item.triggeredByAdmin?.email ?? "admin"}`
                            : "automático"}
                        </AdminPill>
                      </AdminTd>
                      <AdminTd>
                        <AdminPill tone={STATUS_TONE[item.status] ?? "neutral"}>
                          {item.status.toLowerCase()}
                        </AdminPill>
                      </AdminTd>
                      <AdminTd muted>
                        {item.lastEvent
                          ? `${EVENT_LABEL[item.lastEvent.type] ?? item.lastEvent.type.toLowerCase()} · ${fmtDate(item.lastEvent.occurredAt)}`
                          : "—"}
                      </AdminTd>
                      <AdminTd align="right">
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            justifyContent: "flex-end",
                          }}
                        >
                          <Link
                            href={`/admin/alerta-vagas/digest/${item.id}`}
                            className={buttonVariants({
                              variant: "outline",
                              size: "sm",
                            })}
                          >
                            Ver linha do tempo
                          </Link>
                          {item.status === "FAILED" && (
                            <form action={resendDigestAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <input
                                type="hidden"
                                name="redirectPath"
                                value={currentRedirectPath}
                              />
                              <button
                                type="submit"
                                className={buttonVariants({
                                  variant: "outline",
                                  size: "sm",
                                })}
                              >
                                Reenviar
                              </button>
                            </form>
                          )}
                        </div>
                      </AdminTd>
                    </tr>
                  ))}
                  {history.items.length === 0 && (
                    <tr>
                      <AdminTd>
                        <span style={{ color: AT.muted }}>
                          Nenhum envio ainda.
                        </span>
                      </AdminTd>
                    </tr>
                  )}
                </tbody>
              </AdminTable>
              <AdminPagination
                summary={`${history.total} envio(s) · página ${history.page} de ${Math.max(1, Math.ceil(history.total / history.limit))}`}
              >
                {history.page > 1 && (
                  <Link
                    href={historyPageHref(history.page - 1)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Anterior
                  </Link>
                )}
                {history.page * history.limit < history.total && (
                  <Link
                    href={historyPageHref(history.page + 1)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Próxima
                  </Link>
                )}
              </AdminPagination>
            </>
          )}
        </section>
      </AdminSectionGroup>

      <AdminSectionGroup label="Configuração">
        {/* ── Agendamento ─────────────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeading
            title="Agendamento dos disparos automáticos"
            description="Define a cadência e o horário de envio pra todos os usuários — não é mais escolha individual (a tela do usuário só liga/desliga o e-mail). O worker que efetivamente envia roda continuamente, independente do horário abaixo."
          />

          <form action={updateDigestScheduleAction}>
            <input
              type="hidden"
              name="redirectPath"
              value={currentRedirectPath}
            />
            <AdminCard>
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                }}
              >
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span style={{ fontSize: 12, color: AT.muted }}>
                    Cadência
                  </span>
                  <select
                    name="frequency"
                    defaultValue={schedule.frequency}
                    style={{ ...inputStyle, minWidth: 150 }}
                  >
                    {FREQUENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span style={{ fontSize: 12, color: AT.muted }}>
                    Hora (0-23)
                  </span>
                  <input
                    type="number"
                    name="dailyHour"
                    min={0}
                    max={23}
                    defaultValue={schedule.dailyHour}
                    style={{
                      ...inputStyle,
                      width: 76,
                      minWidth: 0,
                      textAlign: "center",
                    }}
                  />
                </label>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span style={{ fontSize: 12, color: AT.muted }}>
                    Minuto (0-59)
                  </span>
                  <input
                    type="number"
                    name="dailyMinute"
                    min={0}
                    max={59}
                    defaultValue={schedule.dailyMinute}
                    style={{
                      ...inputStyle,
                      width: 76,
                      minWidth: 0,
                      textAlign: "center",
                    }}
                  />
                </label>
                <span
                  style={{
                    fontSize: 12,
                    color: AT.muted,
                    fontFamily: '"Geist Mono", monospace',
                  }}
                >
                  {schedule.timezone}
                </span>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span style={{ fontSize: 12, color: AT.muted }}>
                    Dia do digest semanal (só usado quando Cadência = Semanal)
                  </span>
                  <select
                    name="weeklyDayOfWeek"
                    defaultValue={schedule.weeklyDayOfWeek}
                    style={{ ...inputStyle, minWidth: 160 }}
                  >
                    {WEEKDAY_OPTIONS.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </AdminCard>

            <div
              style={{
                marginTop: 12,
                marginBottom: 24,
                padding: "10px 14px",
                background: AT.neutralBg,
                borderRadius: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: AT.muted,
                  fontFamily: '"Geist Mono", monospace',
                }}
              >
                Fila de envio: varredura a cada 30s · lote de 10 · até 3
                tentativas por digest · máximo de 5 vagas por e-mail (as demais
                continuam elegíveis pro próximo digest e visíveis na fila
                completa do usuário).
              </span>
            </div>

            {/* ── Modo de envio (SES) ────────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <SectionHeading
                title="Modo de envio (SES)"
                description='Por qual provider o digest sai — separado da cadência acima. Padrão de deploy é "Resend (padrão atual)": mudar o modo é decisão explícita, só depois que domínio/SNS/webhook do SES estiverem prontos. Fora da coorte (em SES_ROLLOUT) ou modo pausado: usuário elegível não recebe nada, nunca cai pro Resend como substituto.'
              />
              <AdminCard>
                <div
                  style={{
                    display: "flex",
                    gap: 24,
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                  }}
                >
                  <label
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <span style={{ fontSize: 12, color: AT.muted }}>Modo</span>
                    <select
                      name="sesMode"
                      defaultValue={schedule.sesMode}
                      style={{ ...inputStyle, minWidth: 220 }}
                    >
                      {SES_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <span style={{ fontSize: 12, color: AT.muted }}>
                      Coorte (só usada quando Modo = SES — só a coorte)
                    </span>
                    <select
                      name="sesRolloutSegment"
                      defaultValue={schedule.sesRolloutSegment ?? ""}
                      style={{ ...inputStyle, minWidth: 220 }}
                    >
                      <option value="">Nenhuma (ninguém entra ainda)</option>
                      {SES_SEGMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: AT.faint,
                    margin: "12px 0 0",
                  }}
                >
                  Modo atual:{" "}
                  <strong style={{ color: AT.ink2 }}>
                    {SES_MODE_LABEL[schedule.sesMode]}
                  </strong>
                  {schedule.sesMode === "SES_ROLLOUT" && (
                    <>
                      {" "}
                      · coorte:{" "}
                      <strong style={{ color: AT.ink2 }}>
                        {schedule.sesRolloutSegment
                          ? SES_SEGMENT_OPTIONS.find(
                              (o) => o.value === schedule.sesRolloutSegment,
                            )?.label
                          : "nenhuma configurada — ninguém recebe"}
                      </strong>
                    </>
                  )}
                </p>
              </AdminCard>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className={buttonVariants({ size: "sm" })}>
                Salvar agendamento e modo de envio
              </button>
            </div>
          </form>
        </section>

        {/* ── Conteúdo do e-mail ──────────────────────────────────────── */}
        <section>
          <SectionHeading
            title="Conteúdo do e-mail"
            description="Assunto e texto de introdução do digest. As vagas recomendadas continuam montadas automaticamente abaixo dessa introdução."
          />

          <form action={updateDigestContentAction}>
            <input
              type="hidden"
              name="redirectPath"
              value={currentRedirectPath}
            />
            <AdminCard maxWidth={640}>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span style={{ fontSize: 12, color: AT.muted }}>
                    Assunto (use {"{count}"} pro número de vagas — ignorado
                    quando há só 1)
                  </span>
                  <input
                    type="text"
                    name="subject"
                    defaultValue={content.subject}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                </label>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span style={{ fontSize: 12, color: AT.muted }}>
                    Texto de introdução (opcional)
                  </span>
                  <textarea
                    name="introText"
                    defaultValue={content.introText}
                    rows={4}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: `1px solid ${AT.border}`,
                      background: "#fff",
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      resize: "vertical",
                      fontFamily: '"Geist", sans-serif',
                    }}
                  />
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    className={buttonVariants({ size: "sm" })}
                  >
                    Salvar conteúdo
                  </button>
                </div>
              </div>
            </AdminCard>
          </form>
        </section>
      </AdminSectionGroup>
    </AdminPageWrap>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: AT.ink,
          margin: "0 0 3px",
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 12.5, color: AT.muted, margin: 0, maxWidth: 760 }}>
        {description}
      </p>
    </div>
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
