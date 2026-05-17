import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants, Card } from "@/components/ui";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import {
  getAdminDataErrorKind,
  isInvalidAdminTokenError,
  isMissingAdminRoleError,
} from "@/lib/admin-token-errors";
import { listCompanies, listJobSources } from "@/lib/admin-ingestion-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { buildAdminMetadata } from "@/lib/route-metadata";

export const metadata = buildAdminMetadata("Detalhe da fonte");

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminSourceAliasPage({
  params,
  searchParams,
}: PageProps) {
  const [{ id }] = await Promise.all([params, searchParams]);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", `/admin/fontes/${id}`);

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
          <h1 className="text-2xl font-bold tracking-tight">{state.title}</h1>
          <p className="text-sm leading-7 text-stone-600">
            {state.description}
          </p>
          <Link
            className={buttonVariants()}
            href={state.actionHref ?? "/admin/ingestion"}
          >
            {state.actionLabel ?? "Voltar para o painel"}
          </Link>
        </Card>
      </main>
    );
  }

  try {
    const sources = await listJobSources();
    const sourceById = sources.find((source) => source.id === id) ?? null;

    if (sourceById) {
      redirect(`/admin/ingestion/${sourceById.id}`);
    }

    const companySources = sources.filter((source) => source.companyId === id);

    if (companySources.length === 1) {
      redirect(`/admin/ingestion/${companySources[0]!.id}`);
    }

    if (companySources.length > 1) {
      redirect(`/admin/empresas/${id}`);
    }

    const companies = await listCompanies();
    const company = companies.find((item) => item.id === id) ?? null;

    if (company) {
      redirect(`/admin/empresas/${id}`);
    }

    notFound();
  } catch (error) {
    if (isInvalidAdminTokenError(error) || isMissingAdminRoleError(error)) {
      const state = buildAdminStateModel(
        getAdminDataErrorKind(error),
        `/admin/fontes/${id}`,
      );

      return (
        <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
          <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
            <h1 className="text-2xl font-bold tracking-tight">{state.title}</h1>
            <p className="text-sm leading-7 text-stone-600">
              {state.description}
            </p>
            <Link
              className={buttonVariants()}
              href={state.actionHref ?? "/admin/ingestion"}
            >
              {state.actionLabel ?? "Voltar para o painel"}
            </Link>
          </Card>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
          <h1 className="text-2xl font-bold tracking-tight">
            Fonte nao encontrada
          </h1>
          <p className="text-sm leading-7 text-stone-600">
            Nao encontramos uma fonte para este identificador. Se voce abriu uma
            empresa, acesse o detalhe da empresa para escolher a fonte correta.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants()} href="/admin/empresas">
              Ir para empresas
            </Link>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/admin/ingestion"
            >
              Ir para execucao de fontes
            </Link>
          </div>
        </Card>
      </main>
    );
  }
}
