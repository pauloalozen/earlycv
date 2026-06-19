import { redirect } from "next/navigation";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminPill,
  AdminStatCard,
  AdminStatsRow,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { EmptyState } from "@/components/ui";
import {
  type EmitAdminAnalysisEventsResponse,
  emitAdminAnalysisEvents,
  listAdminAnalysisEventsCatalog,
} from "@/lib/admin-analysis-events-api";
import { resolveEmitPayload } from "@/lib/admin-events-emit-payload";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Eventos e logs");

type AdminEventsLogsPageProps = {
  searchParams: Promise<{ result?: string }>;
};

type EventCatalogEntry = {
  eventName: string;
  eventVersion: number;
};

const BLOG_EVENT_NAMES = [
  "blog_index_viewed",
  "blog_post_viewed",
  "blog_cta_clicked",
] as const;

const AUTH_EVENT_NAMES = [
  "auth_oauth_redirect_started",
  "auth_session_identified",
] as const;

const CANDIDATURAS_EVENT_NAMES = [
  "candidaturas_page_viewed",
  "candidatura_created",
  "candidatura_detail_viewed",
  "candidatura_status_changed",
  "candidatura_marked_as_applied",
  "candidatura_archived",
  "candidatura_deleted",
  "candidatura_note_added",
  "candidatura_rejection_feedback_submitted",
] as const;

const INTERVIEW_PREP_EVENT_NAMES = [
  "interview_prep_drawer_opened",
  "interview_prep_generated",
  "interview_prep_viewed",
  "interview_prep_printed",
] as const;

type EventResultsState = {
  error?: string;
  failed: number;
  requested: number;
  results: EmitAdminAnalysisEventsResponse["results"];
  sent: number;
};

function encodeResult(result: EventResultsState) {
  return encodeURIComponent(JSON.stringify(result));
}

function decodeResult(value?: string): EventResultsState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value));

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid result payload");
    }

    const parsedResult = parsed as Partial<EventResultsState> & {
      results?: unknown;
    };

    const safeResults = Array.isArray(parsedResult.results)
      ? parsedResult.results.filter(
          (
            entry,
          ): entry is EmitAdminAnalysisEventsResponse["results"][number] => {
            if (!entry || typeof entry !== "object") {
              return false;
            }

            const candidate = entry as {
              domain?: unknown;
              error?: unknown;
              eventName?: unknown;
              status?: unknown;
            };

            const validDomain =
              candidate.domain === "protection" ||
              candidate.domain === "business";
            const validEventName = typeof candidate.eventName === "string";
            const validStatus =
              candidate.status === "sent" || candidate.status === "failed";
            const validError =
              candidate.error === undefined ||
              typeof candidate.error === "string";

            return validDomain && validEventName && validStatus && validError;
          },
        )
      : [];

    return {
      error:
        typeof parsedResult.error === "string" ? parsedResult.error : undefined,
      failed:
        typeof parsedResult.failed === "number" &&
        Number.isFinite(parsedResult.failed)
          ? parsedResult.failed
          : 0,
      requested:
        typeof parsedResult.requested === "number" &&
        Number.isFinite(parsedResult.requested)
          ? parsedResult.requested
          : 0,
      results: safeResults,
      sent:
        typeof parsedResult.sent === "number" &&
        Number.isFinite(parsedResult.sent)
          ? parsedResult.sent
          : 0,
    };
  } catch {
    return {
      error: "Nao foi possivel ler o ultimo resultado.",
      failed: 0,
      requested: 0,
      results: [],
      sent: 0,
    };
  }
}

function EventSection({
  entries,
  group,
  title,
  desc,
  dispatchMode = "group",
}: {
  entries: EventCatalogEntry[];
  group: "protection" | "business";
  title: string;
  desc: string;
  dispatchMode?: "group" | "list";
}) {
  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        overflowX: "auto",
      }}
    >
      {/* Header do grupo */}
      <div
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${AT.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: AT.ink2 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: AT.muted, marginTop: 1 }}>
              {desc}
            </div>
          </div>
          <span
            style={{
              fontFamily: '"Geist Mono", monospace',
              fontSize: 10.5,
              color: AT.muted2,
              background: AT.neutralBg,
              padding: "2px 7px",
              borderRadius: 3,
              marginLeft: 6,
            }}
          >
            {entries.length} EVENTOS
          </span>
        </div>
        <form action={emitEventsAction}>
          <input name="mode" type="hidden" value={dispatchMode} />
          {dispatchMode === "group" ? (
            <input name="group" type="hidden" value={group} />
          ) : (
            entries.map((entry) => (
              <input
                key={entry.eventName}
                name="eventNames"
                type="hidden"
                value={entry.eventName}
              />
            ))
          )}
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            type="submit"
          >
            Disparar todos do grupo
          </button>
        </form>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 13, color: AT.muted }}>
          Nenhum evento desta categoria.
        </div>
      ) : (
        <div>
          {entries.map((entry, i) => (
            <div
              key={`${group}-${entry.eventName}-${entry.eventVersion}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 18px",
                borderTop: i === 0 ? "none" : `1px solid ${AT.borderSoft}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <code
                  style={{
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 13,
                    color: AT.ink2,
                    fontWeight: 600,
                  }}
                >
                  {entry.eventName}
                </code>
                <span
                  style={{
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 10,
                    color: AT.muted2,
                    background: AT.neutralBg,
                    padding: "1px 6px",
                    borderRadius: 3,
                  }}
                >
                  v{entry.eventVersion}
                </span>
                <span
                  style={{
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 10,
                    color: AT.muted2,
                  }}
                >
                  synthetic: true
                </span>
              </div>
              <form action={emitEventsAction}>
                <input name="eventName" type="hidden" value={entry.eventName} />
                <input name="mode" type="hidden" value="single" />
                <button
                  className={buttonVariants({ size: "sm" })}
                  type="submit"
                >
                  Disparar
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventResults({ result }: { result: EventResultsState | null }) {
  if (!result) {
    return null;
  }

  const hasError = !!result.error || result.failed > 0;
  const accentColor = hasError ? AT.danger : AT.ok;
  const accentBg = hasError ? AT.dangerBg : AT.okBg;
  const accentBorder = hasError
    ? "rgba(155,44,44,0.25)"
    : "rgba(31,122,77,0.22)";
  const headline = hasError
    ? result.error
      ? `Erro: ${result.error}`
      : `${result.failed} evento(s) falharam ao ser disparados`
    : `${result.sent} evento(s) disparados com sucesso`;

  return (
    <div
      id="result"
      style={{
        background: accentBg,
        border: `1.5px solid ${accentBorder}`,
        borderRadius: 10,
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: accentColor,
        }}
      >
        {headline}
      </div>

      {!result.error && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            maxWidth: 360,
          }}
        >
          {[
            { label: "solicitados", value: result.requested },
            { label: "enviados", value: result.sent },
            { label: "falhas", value: result.failed },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: "rgba(255,255,255,0.55)",
                border: `1px solid ${accentBorder}`,
                borderRadius: 6,
                padding: "7px 12px",
              }}
            >
              <div
                style={{
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 10,
                  color: accentColor,
                  opacity: 0.75,
                  marginBottom: 2,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 17,
                  fontWeight: 700,
                  color: accentColor,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.results.length > 0 ? (
        <div
          style={{
            border: `1px solid ${accentBorder}`,
            borderRadius: 8,
            overflowX: "auto",
            background: "rgba(255,255,255,0.45)",
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}
          >
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.3)" }}>
                {["Evento", "Domínio", "Status", "Erro"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "7px 12px",
                      textAlign: "left",
                      fontFamily: '"Geist Mono", monospace',
                      fontSize: 10,
                      fontWeight: 600,
                      color: accentColor,
                      opacity: 0.8,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      borderBottom: `1px solid ${accentBorder}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.results.map((item, i) => (
                <tr
                  key={`${item.domain}-${item.eventName}`}
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${accentBorder}`,
                    opacity: i === 0 ? 1 : 0.9,
                  }}
                >
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: '"Geist Mono", monospace',
                      fontSize: 12,
                      fontWeight: 600,
                      color: accentColor,
                    }}
                  >
                    {item.eventName}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: accentColor,
                      opacity: 0.7,
                    }}
                  >
                    {item.domain}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <AdminPill
                      tone={item.status === "sent" ? "ok" : "danger"}
                      mono
                    >
                      {item.status}
                    </AdminPill>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: accentColor,
                      opacity: 0.7,
                    }}
                  >
                    {item.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

async function emitEventsAction(formData: FormData) {
  "use server";

  const token = await getBackofficeSessionToken();
  if (!token) {
    const result = encodeResult({
      error: "Token de sessao admin ausente para disparar evento.",
      failed: 0,
      requested: 0,
      results: [],
      sent: 0,
    });

    redirect(`/admin/eventos-e-logs?result=${result}#result`);
  }

  try {
    const payload = resolveEmitPayload(formData);
    const response: EmitAdminAnalysisEventsResponse =
      await emitAdminAnalysisEvents(payload);

    redirect(
      `/admin/eventos-e-logs?result=${encodeResult({
        failed: response.failed,
        requested: response.requested,
        results: response.results,
        sent: response.sent,
      })}#result`,
    );
  } catch (error) {
    if (
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Erro inesperado ao disparar evento.";

    redirect(
      `/admin/eventos-e-logs?result=${encodeResult({
        error: message,
        failed: 0,
        requested: 0,
        results: [],
        sent: 0,
      })}#result`,
    );
  }
}

export default function AdminEventsLogsPage({
  searchParams,
}: AdminEventsLogsPageProps) {
  return <AdminEventsLogsPageBody searchParams={searchParams} />;
}

async function AdminEventsLogsPageBody({
  searchParams,
}: AdminEventsLogsPageProps) {
  const [{ result: resultParam }, token] = await Promise.all([
    searchParams,
    getBackofficeSessionToken(),
  ]);

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      "/admin/eventos-e-logs",
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  try {
    const catalog = await listAdminAnalysisEventsCatalog();
    const result = decodeResult(resultParam);
    const totalEvents = catalog.protection.length + catalog.business.length;

    return (
      <AdminPageWrap maxWidth={1100}>
        <AdminShellHeader
          actions={
            <form action={emitEventsAction}>
              <input name="mode" type="hidden" value="all" />
              <button className={buttonVariants()} type="submit">
                Disparar todos
              </button>
            </form>
          }
          eyebrow="admin · eventos & logs · observabilidade"
          subtitle="Disparos manuais para validar observabilidade. Todos os eventos desta tela são synthetic: true para separar do tráfego real."
          title="Eventos e logs."
        />

        <EventResults result={result} />

        {/* Aviso */}
        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 8,
            padding: "11px 16px",
            marginBottom: 20,
            fontSize: 12.5,
            color: AT.muted,
            lineHeight: 1.5,
          }}
        >
          Use esta página para enviar eventos sintéticos sem impacto de negócio.
          Filtre dashboards por{" "}
          <code
            style={{
              fontFamily: '"Geist Mono", monospace',
              color: AT.ink2,
              fontWeight: 600,
            }}
          >
            synthetic: true
          </code>
          .
        </div>

        <AdminStatsRow>
          <AdminStatCard
            label="Eventos registrados"
            value={String(totalEvents)}
            sub="em todas as categorias"
          />
          <AdminStatCard
            label="Disparados (sessão)"
            value="—"
            sub="aguardando ação"
          />
          <AdminStatCard label="Últimos 60min" value="—" />
          <AdminStatCard label="Erros de envio" value="0" sub="tudo verde" />
        </AdminStatsRow>

        {catalog.protection.length === 0 && catalog.business.length === 0 ? (
          <EmptyState
            description="Não há eventos catalogados para disparo manual no momento."
            title="Catálogo vazio"
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <EventSection
              desc="Sinais de abuso, bloqueios e guardrails"
              entries={catalog.protection}
              group="protection"
              title="Protection"
            />
            <EventSection
              desc="Login, sessão, OAuth e eventos de autenticação"
              entries={catalog.business.filter((e) =>
                AUTH_EVENT_NAMES.includes(
                  e.eventName as (typeof AUTH_EVENT_NAMES)[number],
                ),
              )}
              group="business"
              title="Auth"
            />
            <EventSection
              desc="Criação, status, archiving e exclusão de candidaturas"
              dispatchMode="list"
              entries={catalog.business.filter((e) =>
                CANDIDATURAS_EVENT_NAMES.includes(
                  e.eventName as (typeof CANDIDATURAS_EVENT_NAMES)[number],
                ),
              )}
              group="business"
              title="Candidaturas"
            />
            <EventSection
              desc="Geração, visualização e impressão da preparação para entrevista"
              dispatchMode="list"
              entries={catalog.business.filter((e) =>
                INTERVIEW_PREP_EVENT_NAMES.includes(
                  e.eventName as (typeof INTERVIEW_PREP_EVENT_NAMES)[number],
                ),
              )}
              group="business"
              title="Preparação para Entrevista"
            />
            <EventSection
              desc="Checkout, aprovação, estorno"
              entries={catalog.business.filter(
                (e) =>
                  !AUTH_EVENT_NAMES.includes(
                    e.eventName as (typeof AUTH_EVENT_NAMES)[number],
                  ) &&
                  !BLOG_EVENT_NAMES.includes(
                    e.eventName as (typeof BLOG_EVENT_NAMES)[number],
                  ) &&
                  !CANDIDATURAS_EVENT_NAMES.includes(
                    e.eventName as (typeof CANDIDATURAS_EVENT_NAMES)[number],
                  ) &&
                  !INTERVIEW_PREP_EVENT_NAMES.includes(
                    e.eventName as (typeof INTERVIEW_PREP_EVENT_NAMES)[number],
                  ),
              )}
              group="business"
              title="Business"
            />
          </div>
        )}
      </AdminPageWrap>
    );
  } catch {
    const state = buildAdminStateModel(
      "unexpected-error",
      "/admin/eventos-e-logs",
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }
}
