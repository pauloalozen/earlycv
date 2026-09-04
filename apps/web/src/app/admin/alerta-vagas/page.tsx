import {
  AdminFilterBar,
  AdminPageWrap,
  AdminPagination,
  AdminPill,
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
  type DigestContent,
  type DigestEmailStats,
  type DigestHistoryItem,
  type DigestSchedule,
  getMonitorDigestContent,
  getMonitorDigestHistory,
  getMonitorDigestSchedule,
  getMonitorDigestStats,
  listTrackedAlertUsers,
  type TrackedAlertUser,
} from "@/lib/admin-monitor-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { isJobsGhostModeEnabled } from "@/lib/jobs-ghost-mode";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { buttonVariants } from "../_components/admin-button";
import { TrackUserCombobox } from "./_components/track-user-combobox";
import {
  resendDigestAction,
  sendDigestNowAction,
  updateDigestContentAction,
  updateDigestScheduleAction,
} from "./actions";

export const metadata = buildAdminMetadata("Alerta de Vagas");

const ROOT_PATH = "/admin/alerta-vagas";

const FREQUENCY_LABEL: Record<string, string> = {
  DAILY: "diária",
  WEEKLY: "semanal",
  OFF: "desligado",
};

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
};

type SearchParams = Promise<{
  query?: string;
  historyQuery?: string;
  historySource?: string;
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
  const { query, historyQuery, historySource, status, message } =
    await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", ROOT_PATH);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let trackedUsers: { total: number; users: TrackedAlertUser[] };
  let history: { total: number; items: DigestHistoryItem[] };
  let stats: DigestEmailStats;
  let schedule: DigestSchedule;
  let content: DigestContent;
  try {
    [trackedUsers, history, stats, schedule, content] = await Promise.all([
      listTrackedAlertUsers({ query, limit: 20 }, token),
      getMonitorDigestHistory(
        {
          userQuery: historyQuery,
          source:
            historySource === "MANUAL" || historySource === "AUTOMATIC"
              ? historySource
              : undefined,
          limit: 20,
        },
        token,
      ),
      getMonitorDigestStats(token),
      getMonitorDigestSchedule(token),
      getMonitorDigestContent(token),
    ]);
  } catch {
    const state = buildAdminStateModel("unexpected-error", ROOT_PATH);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const currentRedirectPath = buildRedirectPath({
    query,
    historyQuery,
    historySource,
  });

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Radar Oportunidades"
        title="Alerta de Vagas"
        subtitle="Gestão operacional do Alerta de Vaga Certa: elegibilidade, disparo manual, histórico, agendamento e conteúdo do e-mail."
        actions={
          <AdminPill mono tone={isJobsGhostModeEnabled() ? "neutral" : "warn"}>
            {isJobsGhostModeEnabled()
              ? "JOBS_GHOST_MODE ativo"
              : "JOBS_GHOST_MODE desligado"}
          </AdminPill>
        }
      />

      <StatusBanner status={status} message={message} />

      {/* ── Elegibilidade e disparo manual ─────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <SectionHeading
          title="Elegibilidade e disparo manual"
          description={
            'Hoje o acesso ao Alerta depende só do papel interno (ghost mode). Frequência é a preferência que o próprio usuário configurou. "Liberação manual" ainda não decide nada — a coluna já está pronta pra quando essa regra existir. "Disparar agora" envia o digest desse usuário na hora, na frequência dele, de forma síncrona.'
          }
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
              <button type="submit" className={buttonVariants({ size: "sm" })}>
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
              <AdminTh>Frequência</AdminTh>
              <AdminTh>Liberação manual</AdminTh>
              <AdminTh align="right">Ação</AdminTh>
            </tr>
          </thead>
          <tbody>
            {trackedUsers.users.map((user) => {
              const canSend = user.entitledToday && user.frequency !== "OFF";
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
                    <AdminPill mono>
                      {FREQUENCY_LABEL[user.frequency]}
                    </AdminPill>
                  </AdminTd>
                  <AdminTd>
                    <AdminPill tone="warn">em breve</AdminPill>
                  </AdminTd>
                  <AdminTd align="right">
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
                          canSend ? undefined : "Usuário não é elegível hoje"
                        }
                      >
                        Disparar agora →
                      </button>
                    </form>
                  </AdminTd>
                </tr>
              );
            })}
            {trackedUsers.users.length === 0 && (
              <tr>
                <AdminTd>
                  <span style={{ color: AT.muted }}>
                    Nenhum usuário incluído ainda — use "Incluir usuário" acima.
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
          description="Todos os digests já processados, manuais e automáticos."
        />

        <AdminStatsRow cols={6}>
          <AdminStatCard
            label="Enviados (24h)"
            value={String(stats.sentLast24h)}
          />
          <AdminStatCard
            label="Delivered (24h)"
            value={String(stats.eventsLast24h.DELIVERED)}
          />
          <AdminStatCard
            label="Opened (24h)"
            value={String(stats.eventsLast24h.OPENED)}
            sub="indicativo"
          />
          <AdminStatCard
            label="Clicked (24h)"
            value={String(stats.eventsLast24h.CLICKED)}
          />
          <AdminStatCard
            label="Bounced (24h)"
            value={String(stats.eventsLast24h.BOUNCED)}
          />
          <AdminStatCard
            label="Complained (24h)"
            value={String(stats.eventsLast24h.COMPLAINED)}
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
        </div>

        <form method="GET" style={{ marginBottom: 14 }}>
          <input type="hidden" name="query" value={query ?? ""} />
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
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              Filtrar
            </button>
          </AdminFilterBar>
        </form>

        <AdminTable>
          <thead>
            <tr>
              <AdminTh>Data/hora</AdminTh>
              <AdminTh>Usuário</AdminTh>
              <AdminTh>Forma de envio</AdminTh>
              <AdminTh>Frequência</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh align="right">Ação</AdminTh>
            </tr>
          </thead>
          <tbody>
            {history.items.map((item) => (
              <tr key={item.id}>
                <AdminTd mono>{fmtDate(item.sentAt ?? item.createdAt)}</AdminTd>
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
                    tone={item.source === "ADMIN_MANUAL" ? "info" : "neutral"}
                  >
                    {item.source === "ADMIN_MANUAL"
                      ? `manual · ${item.triggeredByAdmin?.name ?? item.triggeredByAdmin?.email ?? "admin"}`
                      : "automático"}
                  </AdminPill>
                </AdminTd>
                <AdminTd>{FREQUENCY_LABEL[item.frequency]}</AdminTd>
                <AdminTd>
                  <AdminPill tone={STATUS_TONE[item.status] ?? "neutral"}>
                    {item.status.toLowerCase()}
                  </AdminPill>
                </AdminTd>
                <AdminTd align="right">
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
                </AdminTd>
              </tr>
            ))}
            {history.items.length === 0 && (
              <tr>
                <AdminTd>
                  <span style={{ color: AT.muted }}>Nenhum envio ainda.</span>
                </AdminTd>
              </tr>
            )}
          </tbody>
        </AdminTable>
        <AdminPagination summary={`${history.total} envio(s)`}>
          {null}
        </AdminPagination>
      </section>

      {/* ── Agendamento ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <SectionHeading
          title="Agendamento dos disparos automáticos"
          description="Define quando os digests são gerados. O worker que efetivamente envia roda continuamente, independente do horário abaixo."
        />

        <form action={updateDigestScheduleAction}>
          <input
            type="hidden"
            name="redirectPath"
            value={currentRedirectPath}
          />
          <div
            style={{
              background: AT.card,
              border: `1px solid ${AT.border}`,
              borderRadius: 10,
              padding: "18px 20px",
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: AT.muted }}>Hora (0-23)</span>
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
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: AT.muted }}>
                Dia do digest semanal
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
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              Salvar agendamento
            </button>
          </div>
        </form>
        <div
          style={{
            marginTop: 12,
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
            Fila de envio: varredura a cada 30s · lote de 10 · até 3 tentativas
            por digest.
          </span>
        </div>
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
          <div
            style={{
              background: AT.card,
              border: `1px solid ${AT.border}`,
              borderRadius: 10,
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxWidth: 640,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: AT.muted }}>
                Assunto (use {"{count}"} pro número de vagas — ignorado quando
                há só 1)
              </span>
              <input
                type="text"
                name="subject"
                defaultValue={content.subject}
                style={{ ...inputStyle, width: "100%" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
              <button type="submit" className={buttonVariants({ size: "sm" })}>
                Salvar conteúdo
              </button>
            </div>
          </div>
        </form>
      </section>
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
