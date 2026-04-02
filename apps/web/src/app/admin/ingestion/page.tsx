import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants, Card, Input } from "@/components/ui";
import { listJobSources } from "@/lib/admin-ingestion-api";
import { buildSourceStatus, filterSources } from "@/lib/admin-operations";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { cn } from "@/lib/cn";

import { runJobSourceAction } from "./actions";

type SearchParams = Promise<{
  message?: string;
  query?: string;
  status?: string;
  token?: string;
  type?: string;
}>;

type AdminIngestionPageProps = {
  searchParams: SearchParams;
};

export const metadata: Metadata = {
  title: "Admin de ingestao",
  robots: {
    index: false,
    follow: false,
  },
};

function StatusBanner({
  message,
  status,
}: {
  message?: string;
  status?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-orange-200 bg-orange-50 text-orange-900",
      )}
    >
      {message}
    </div>
  );
}

function TokenForm() {
  const state = buildAdminStateModel("missing-token", "/admin/ingestion");

  return (
    <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
      <div className="space-y-2">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700">
          acesso interno
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">
          Painel manual de ingestao
        </h1>
        <p className="text-sm leading-7 text-stone-600">
          Cole um `access_token` valido da API para listar as fontes, disparar
          runs e acompanhar a auditoria basica.
        </p>
      </div>

      <form className="space-y-3" method="GET">
        <Input name="token" placeholder="Bearer token da API" required />
        <button className={buttonVariants({ block: true })} type="submit">
          Entrar no painel
        </button>
      </form>

      <p className="text-sm leading-7 text-stone-600">{state.description}</p>
    </Card>
  );
}

export default async function AdminIngestionPage({
  searchParams,
}: AdminIngestionPageProps) {
  const { message, query, status, type } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <TokenForm />
      </main>
    );
  }

  try {
    const sources = await listJobSources();
    const sourceViews = sources.map((source) => ({
      ...source,
      status: buildSourceStatus(source),
    }));
    const filteredSources = filterSources(sourceViews, { query, status, type });

    return (
      <main className="min-h-screen bg-linear-to-b from-stone-50 via-orange-50/30 to-stone-100 px-6 py-10 text-stone-900 md:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="space-y-3">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700">
              admin / ingestion
            </p>
            <h1 className="text-4xl font-bold tracking-tight">
              Runs manuais por fonte
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-stone-600">
              Execute ingestao sincrona, valide contadores e acompanhe as
              ultimas tentativas antes de plugar a fila assíncrona.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants()} href={`/admin/ingestion/new`}>
              Adicionar empresa e fonte
            </Link>
          </div>

          <StatusBanner message={message} status={status} />

          <Card
            className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto]"
            padding="sm"
            variant="ghost"
          >
            <Input
              defaultValue={query}
              form="sources-filter"
              name="query"
              placeholder="Buscar fonte ou empresa"
            />
            <select
              className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
              defaultValue={status ?? ""}
              form="sources-filter"
              name="status"
            >
              <option value="">Todos os status</option>
              <option value="aguardando primeiro run">
                aguardando primeiro run
              </option>
              <option value="falha recente">falha recente</option>
              <option value="ativa">ativa</option>
            </select>
            <select
              className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
              defaultValue={type ?? ""}
              form="sources-filter"
              name="type"
            >
              <option value="">Todos os tipos</option>
              <option value="custom_html">custom_html</option>
              <option value="custom_api">custom_api</option>
            </select>
            <form className="contents" id="sources-filter" method="GET">
              <button
                className={buttonVariants({ variant: "outline" })}
                type="submit"
              >
                Filtrar
              </button>
            </form>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {filteredSources.map((source) => {
              const latestRun = source.ingestionRuns?.[0] ?? null;
              const redirectPath = `/admin/ingestion`;

              return (
                <Card className="space-y-5" key={source.id}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">
                          {source.company.name}
                        </p>
                        <h2 className="text-xl font-bold tracking-tight text-stone-900">
                          {source.sourceName}
                        </h2>
                      </div>
                      <span className="rounded-full bg-orange-100 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-orange-800">
                        {source.sourceType}
                      </span>
                    </div>

                    <p className="text-sm text-stone-600">{source.sourceUrl}</p>
                  </div>

                  <div className="grid gap-3 rounded-[18px] border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
                        ultimo run
                      </p>
                      <p className="mt-2 text-sm font-medium text-stone-900">
                        {latestRun ? latestRun.status : "ainda nao executado"}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
                        parser
                      </p>
                      <p className="mt-2 text-sm font-medium text-stone-900">
                        {source.parserKey}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
                        novos / atualizados
                      </p>
                      <p className="mt-2 text-sm font-medium text-stone-900">
                        {latestRun
                          ? `${latestRun.newCount} / ${latestRun.updatedCount}`
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
                        falhas
                      </p>
                      <p className="mt-2 text-sm font-medium text-stone-900">
                        {latestRun ? latestRun.failedCount : 0}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <form action={runJobSourceAction}>
                      <input
                        name="jobSourceId"
                        type="hidden"
                        value={source.id}
                      />
                      <input
                        name="redirectPath"
                        type="hidden"
                        value={redirectPath}
                      />
                      <button className={buttonVariants()} type="submit">
                        Rodar agora
                      </button>
                    </form>

                    <Link
                      className={buttonVariants({ variant: "outline" })}
                      href={`/admin/ingestion/${source.id}`}
                    >
                      Ver auditoria
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    );
  } catch (error) {
    const state = buildAdminStateModel(
      getAdminDataErrorKind(error),
      "/admin/ingestion",
    );

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-3xl space-y-4" padding="lg">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700">
            admin / ingestion
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{state.title}</h1>
          <p className="text-sm leading-7 text-stone-600">
            {state.description}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={state.actionHref ?? "/admin/ingestion"}
            >
              {state.actionLabel ?? "Voltar ao login do painel"}
            </Link>
          </div>
        </Card>
      </main>
    );
  }
}
