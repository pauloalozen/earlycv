import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge, buttonVariants, Card, EmptyState } from "@/components/ui";
import {
  type AdminResumeTemplateDto,
  adminListResumeTemplates,
  adminToggleResumeTemplateStatus,
} from "@/lib/admin-resume-templates-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

type AdminTemplatesPageProps = {
  searchParams: Promise<{ token?: string }>;
};

async function toggleStatus(id: string, _formData: FormData) {
  "use server";
  await adminToggleResumeTemplateStatus(id);
  revalidatePath("/admin/templates");
}

export default async function AdminTemplatesPage({
  searchParams,
}: AdminTemplatesPageProps) {
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/templates");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let templates: AdminResumeTemplateDto[];
  try {
    templates = await adminListResumeTemplates();
  } catch (_error) {
    const state = buildAdminStateModel("unexpected-error", "/admin/templates");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          actions={
            <Link className={buttonVariants()} href="/admin/templates/novo">
              Novo template
            </Link>
          }
          eyebrow="admin / templates de cv"
          subtitle="Gerencie os templates disponíveis para adaptação de CV."
          title="Templates de CV"
        />

        {templates.length === 0 ? (
          <EmptyState
            description="Crie o primeiro template para ele aparecer na tela de adaptação."
            title="Nenhum template cadastrado"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {templates.map((template) => (
              <Card className="space-y-4" key={template.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xl font-bold tracking-tight text-stone-950">
                      {template.name}
                    </p>
                    <p className="font-mono text-sm text-stone-500">
                      {template.slug}
                    </p>
                  </div>
                  <Badge variant={template.isActive ? "accent" : "neutral"}>
                    {template.isActive ? "ativo" : "inativo"}
                  </Badge>
                </div>

                {template.description && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                    <p className="text-sm text-stone-600">
                      {template.description}
                    </p>
                  </div>
                )}

                {template.targetRole && (
                  <div className="grid gap-2 text-sm text-stone-600">
                    <p>
                      <strong>Cargo alvo:</strong> {template.targetRole}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Link
                    className={buttonVariants()}
                    href={`/admin/templates/${template.id}`}
                  >
                    Editar
                  </Link>
                  <form action={toggleStatus.bind(null, template.id)}>
                    <button
                      className={buttonVariants({ variant: "outline" })}
                      type="submit"
                    >
                      {template.isActive ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
