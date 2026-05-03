import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, buttonVariants, Card, InfoField } from "@/components/ui";
import { getAdminUsersDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import {
  buildAdminUserState,
  getResumeDisplayKind,
} from "@/lib/admin-users-operations";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { AdminTokenState } from "../../_components/admin-token-state";

export const metadata = buildAdminMetadata("Detalhe do curriculo");

type AdminResumeDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminResumeDetailPage({
  params,
  searchParams,
}: AdminResumeDetailPageProps) {
  const [{ id }] = await Promise.all([params, searchParams]);
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/curriculos/${id}`,
    );

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
      `/admin/curriculos/${id}`,
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { adminUserViews } = usersDataResult.data;

  const owner =
    adminUserViews.find((user) =>
      user.resumes.some((resume) => resume.id === id),
    ) ?? null;
  const resume = owner?.resumes.find((item) => item.id === id) ?? null;

  if (!owner || !resume) {
    notFound();
  }

  const resumeKind = getResumeDisplayKind(resume);

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <AdminShellHeader
          actions={
            <>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/curriculos`}
              >
                Voltar para curriculos
              </Link>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/admin/usuarios/${owner.id}`}
              >
                Abrir usuario
              </Link>
            </>
          }
          eyebrow="admin / curriculos / detalhe"
          subtitle="Confirme se este arquivo representa o CV master base ou um CV adaptado derivado para candidatura."
          title={resume.title}
        />

        <Card className="flex items-center justify-between gap-3" padding="lg">
          <div className="space-y-1">
            <p className="text-sm text-stone-600">
              {owner.name} - {owner.email}
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
              {resume.id}
            </p>
          </div>
          <Badge variant={resumeKind === "master" ? "dark" : "accent"}>
            {resumeKind === "master"
              ? "CV master"
              : resumeKind === "base"
                ? "CV base"
                : "CV adaptado"}
          </Badge>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoField label="status" description={resume.status} />
          <InfoField label="usuario" description={owner.id} />
          <InfoField
            label="perfil do usuario"
            description={
              buildAdminUserState(owner).hasProfile
                ? "completo"
                : owner.profile
                  ? "incompleto"
                  : "ausente"
            }
          />
          <InfoField
            label="total de curriculos do usuario"
            description={String(owner.resumes.length)}
          />
        </div>
      </div>
    </div>
  );
}
