import Link from "next/link";

import {
  Badge,
  buttonVariants,
  Card,
  EmptyState,
  Input,
} from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminResumeDetailHref,
  filterAdminUsers,
  getResumeDisplayKind,
} from "@/lib/admin-users-operations";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Curriculos");

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

type AdminResumesPageProps = {
  searchParams: Promise<{
    kind?: string;
    query?: string;
    status?: string;
    token?: string;
  }>;
};

export default async function AdminResumesPage({
  searchParams,
}: AdminResumesPageProps) {
  const { kind, query, status } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/curriculos");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const usersDataResult = await getAdminUsersDataSafely();

  if (usersDataResult.kind !== "ok") {
    const state = buildAdminStateModel(
      usersDataResult.kind,
      "/admin/curriculos",
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { adminUserViews } = usersDataResult.data;

  const matchingUserIds = new Set(
    filterAdminUsers(adminUserViews, { query }).map((user) => user.id),
  );
  const normalizedQuery = query ? normalizeQuery(query) : "";
  const resumeViews = adminUserViews
    .flatMap((user) =>
      user.resumes.map((resume) => ({
        owner: user,
        resume,
        resumeKind: getResumeDisplayKind(resume),
      })),
    )
    .filter(({ owner, resume, resumeKind }) => {
      const matchesOwner = !query || matchingUserIds.has(owner.id);
      const matchesResume =
        !query ||
        normalizeQuery(resume.title).includes(normalizedQuery) ||
        normalizeQuery(resume.id).includes(normalizedQuery);

      return (
        (matchesOwner || matchesResume) &&
        (!kind || resumeKind === kind) &&
        (!status || resume.status === status)
      );
    });

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / curriculos"
          subtitle="Audite separadamente o CV master usado como base e cada CV adaptado gerado para vagas especificas."
          title="Curriculos"
        />

        <Card
          className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr_auto]"
          padding="sm"
          variant="ghost"
        >
          <Input
            defaultValue={query}
            form="resumes-filter"
            name="query"
            placeholder="Buscar por usuario, titulo ou id do curriculo"
          />
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={kind ?? ""}
            form="resumes-filter"
            name="kind"
          >
            <option value="">Todos os tipos</option>
            <option value="master">CV master</option>
            <option value="base">CV base</option>
            <option value="adapted">CV adaptado</option>
          </select>
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={status ?? ""}
            form="resumes-filter"
            name="status"
          >
            <option value="">Todos os status</option>
            <option value="draft">draft</option>
            <option value="uploaded">uploaded</option>
            <option value="reviewed">reviewed</option>
            <option value="failed">failed</option>
          </select>
          <form className="contents" id="resumes-filter" method="GET">
            <button
              className={buttonVariants({ variant: "outline" })}
              type="submit"
            >
              Filtrar
            </button>
          </form>
        </Card>

        {resumeViews.length === 0 ? (
          <EmptyState
            description="Nenhum curriculo corresponde aos filtros atuais."
            title="Nenhum resultado"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {resumeViews.map(({ owner, resume, resumeKind }) => (
              <Card className="space-y-4" key={resume.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xl font-bold tracking-tight text-stone-950">
                      {resume.title}
                    </p>
                    <p className="text-sm text-stone-600">
                      {owner.name} - {owner.email}
                    </p>
                  </div>
                  <Badge
                    variant={
                      resumeKind === "master"
                        ? "dark"
                        : resumeKind === "base"
                          ? "outline"
                          : "accent"
                    }
                  >
                    {resumeKind === "master"
                      ? "CV master"
                      : resumeKind === "base"
                        ? "CV base"
                        : "CV adaptado"}
                  </Badge>
                </div>

                <div className="grid gap-2 rounded-[18px] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                  <p>Status: {resume.status}</p>
                  <p>ID: {resume.id}</p>
                  <p>Usuario: {owner.id}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    className={buttonVariants()}
                    href={buildAdminResumeDetailHref(resume.id)}
                  >
                    Abrir curriculo
                  </Link>
                  <Link
                    className={buttonVariants({ variant: "outline" })}
                    href={`/admin/usuarios/${owner.id}`}
                  >
                    Ver usuario
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
