import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";
import { Badge, Card, EmptyState, Input } from "@/components/ui";
import { getAdminResumesListDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminResumeDetailHref,
  getResumeDisplayKind,
} from "@/lib/admin-users-operations";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Curriculos");

type AdminResumesPageProps = {
  searchParams: Promise<{
    kind?: string;
    page?: string;
    query?: string;
    status?: string;
    token?: string;
  }>;
};

function isResumeKind(value: string | undefined): value is "master" | "base" | "adapted" {
  return value === "master" || value === "base" || value === "adapted";
}

export default async function AdminResumesPage({
  searchParams,
}: AdminResumesPageProps) {
  const { kind, page, query, status } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/curriculos");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const resumesDataResult = await getAdminResumesListDataSafely({
    kind: isResumeKind(kind) ? kind : undefined,
    page: pageNum,
    query,
    status,
  });

  if (resumesDataResult.kind !== "ok") {
    const state = buildAdminStateModel(
      resumesDataResult.kind,
      "/admin/curriculos",
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { limit, resumes, total } = resumesDataResult.data;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePageNum = Math.min(pageNum, totalPages);

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

        {total === 0 ? (
          <EmptyState
            description="Nenhum curriculo corresponde aos filtros atuais."
            title="Nenhum resultado"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {resumes.map((resume) => {
              const resumeKind = getResumeDisplayKind(resume);

              return (
                <Card className="space-y-4" key={resume.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xl font-bold tracking-tight text-stone-950">
                        {resume.title}
                      </p>
                      <p className="text-sm text-stone-600">
                        {resume.user.name} - {resume.user.email}
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
                    <p>Usuario: {resume.user.id}</p>
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
                      href={`/admin/usuarios/${resume.user.id}`}
                    >
                      Ver usuario
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {totalPages > 1 && total > 0 && (
          <div
            className="flex items-center justify-between text-sm"
            style={{ color: AT.muted }}
          >
            <span>
              Página {safePageNum} de {totalPages} · {total} currículos
            </span>
            <div className="flex gap-2">
              {safePageNum > 1 && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref({
                    page: safePageNum - 1,
                    kind,
                    query,
                    status,
                  })}
                >
                  ← Anterior
                </Link>
              )}
              {safePageNum < totalPages && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref({
                    page: safePageNum + 1,
                    kind,
                    query,
                    status,
                  })}
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildPageHref(params: {
  kind?: string;
  page: number;
  query?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  if (params.kind) qs.set("kind", params.kind);
  if (params.query) qs.set("query", params.query);
  if (params.status) qs.set("status", params.status);
  return `/admin/curriculos?${qs}`;
}
