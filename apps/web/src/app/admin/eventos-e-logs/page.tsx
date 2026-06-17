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
}: {
  entries: EventCatalogEntry[];
  group: "protection" | "business";
  title: string;
  desc: string;
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
          <input name="group" type="hidden" value={group} />
          <input name="mode" type="hidden" value="group" />
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

  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginBottom: 8,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            color: AT.ink2,
            marginBottom: 4,
          }}
        >
          Resultado da operação
        </div>
        {result.error ? (
          <div style={{ fontSize: 12.5, color: AT.danger }}>{result.error}</div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {[
          { label: "requested", value: result.requested },
          { label: "sent", value: result.sent },
          { label: "failed", value: result.failed },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: AT.bgAlt,
              border: `1px solid ${AT.borderSoft}`,
              borderRadius: 6,
              padding: "8px 12px",
            }}
          >
            <div
              style={{
                fontFamily: '"Geist Mono", monospace',
                fontSize: 10,
                color: AT.muted2,
                marginBottom: 2,
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontFamily: '"Geist Mono", monospace',
                fontSize: 18,
                fontWeight: 600,
                color: AT.ink2,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {result.results.length > 0 ? (
        <div
          style={{
            border: `1px solid ${AT.border}`,
            borderRadius: 8,
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr style={{ background: AT.bgAlt }}>
                {["Evento", "Domínio", "Status", "Erro"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontFamily: '"Geist Mono", monospace',
                      fontSize: 10,
                      fontWeight: 600,
                      color: AT.muted2,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      borderBottom: `1px solid ${AT.border}`,
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
                    borderTop: i === 0 ? "none" : `1px solid ${AT.borderSoft}`,
                  }}
                >
                  <td
                    style={{
                      padding: "9px 12px",
                      fontFamily: '"Geist Mono", monospace',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: AT.ink2,
                    }}
                  >
                    {item.eventName}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      fontSize: 12.5,
                      color: AT.muted,
                    }}
                  >
                    {item.domain}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <AdminPill
                      tone={item.status === "sent" ? "ok" : "danger"}
                      mono
                    >
                      {item.status}
                    </AdminPill>
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      fontSize: 12.5,
                      color: AT.muted,
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

    redirect(`/admin/eventos-e-logs?result=${result}`);
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
      })}`,
    );
  } catch (error) {
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
      })}`,
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
    const totalEvents =
      catalog.protection.length +
      catalog.business.length +
      BLOG_EVENT_NAMES.length +
      AUTH_EVENT_NAMES.length;

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

        <EventResults result={result} />

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
              desc="Checkout, aprovação, estorno"
              entries={catalog.business.filter(
                (e) =>
                  !AUTH_EVENT_NAMES.includes(
                    e.eventName as (typeof AUTH_EVENT_NAMES)[number],
                  ) &&
                  !BLOG_EVENT_NAMES.includes(
                    e.eventName as (typeof BLOG_EVENT_NAMES)[number],
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
