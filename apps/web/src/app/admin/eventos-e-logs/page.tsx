import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Badge, buttonVariants, Card, EmptyState } from "@/components/ui";
import {
  type EmitAdminAnalysisEventsResponse,
  emitAdminAnalysisEvents,
  listAdminAnalysisEventsCatalog,
} from "@/lib/admin-analysis-events-api";
import { resolveEmitPayload } from "@/lib/admin-events-emit-payload";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

type AdminEventsLogsPageProps = {
  searchParams: Promise<{ result?: string }>;
};

type EventCatalogEntry = {
  eventName: string;
  eventVersion: number;
};

type EventResultsState = {
  error?: string;
  failed: number;
  requested: number;
  results: EmitAdminAnalysisEventsResponse["results"];
  sent: number;
};

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Eventos e logs",
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
}: {
  entries: EventCatalogEntry[];
  group: "protection" | "business";
  title: string;
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <p className="text-sm text-stone-600">Nenhum evento desta categoria.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight text-stone-900">
          {title}
        </h2>
        <form action={emitEventsAction}>
          <input name="group" type="hidden" value={group} />
          <input name="mode" type="hidden" value="group" />
          <button
            className={buttonVariants({ variant: "outline" })}
            type="submit"
          >
            {group === "protection"
              ? "Disparar todos de protecao"
              : "Disparar todos de business"}
          </button>
        </form>
      </div>

      <div className="grid gap-3">
        {entries.map((entry) => (
          <Card
            className="flex flex-wrap items-center justify-between gap-3"
            key={`${group}-${entry.eventName}-${entry.eventVersion}`}
          >
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                {entry.eventName}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                <Badge variant="neutral">v{entry.eventVersion}</Badge>
                <Badge variant="neutral">synthetic: true</Badge>
              </div>
            </div>

            <form action={emitEventsAction}>
              <input name="eventName" type="hidden" value={entry.eventName} />
              <input name="mode" type="hidden" value="single" />
              <button className={buttonVariants({ size: "sm" })} type="submit">
                Disparar evento
              </button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EventResults({ result }: { result: EventResultsState | null }) {
  if (!result) {
    return null;
  }

  return (
    <Card className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-bold tracking-tight text-stone-900">
          Resultado da operacao
        </h2>
        {result.error ? (
          <p className="text-sm text-orange-700">{result.error}</p>
        ) : null}
      </div>

      <div className="grid gap-2 text-sm text-stone-700 md:grid-cols-3">
        <p>
          <strong>requested:</strong> {result.requested}
        </p>
        <p>
          <strong>sent:</strong> {result.sent}
        </p>
        <p>
          <strong>failed:</strong> {result.failed}
        </p>
      </div>

      {result.results.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-stone-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-[0.12em] text-stone-500">
              <tr>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">Dominio</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {result.results.map((item) => (
                <tr key={`${item.domain}-${item.eventName}`}>
                  <td className="px-4 py-3 font-medium text-stone-900">
                    {item.eventName}
                  </td>
                  <td className="px-4 py-3 text-stone-700">{item.domain}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={item.status === "sent" ? "success" : "neutral"}
                    >
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {item.error ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
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

    return (
      <div className="px-6 py-10 md:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <AdminShellHeader
            eyebrow="admin / eventos e logs"
            subtitle="Disparos manuais para validar observabilidade. Todos os eventos desta tela sao synthetic: true para separar trafego fake do trafego real."
            title="Eventos e logs"
          />

          <Card className="space-y-2" variant="ghost">
            <p className="text-sm text-stone-700">
              Use esta pagina para enviar eventos sinteticos sem impacto de
              negocio. Filtre dashboards por <strong>synthetic: true</strong>.
            </p>
          </Card>

          <form action={emitEventsAction}>
            <input name="mode" type="hidden" value="all" />
            <button className={buttonVariants()} type="submit">
              Disparar todos os eventos
            </button>
          </form>

          <EventResults result={result} />

          {catalog.protection.length === 0 && catalog.business.length === 0 ? (
            <EmptyState
              description="Nao ha eventos catalogados para disparo manual no momento."
              title="Catalogo vazio"
            />
          ) : (
            <div className="space-y-8">
              <EventSection
                entries={catalog.protection}
                group="protection"
                title="Eventos de protection"
              />
              <EventSection
                entries={catalog.business}
                group="business"
                title="Eventos de business"
              />
            </div>
          )}
        </div>
      </div>
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
