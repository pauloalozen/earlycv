import { revalidatePath } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants, Card, Input } from "@/components/ui";
import {
  type AdminResumeTemplateDto,
  adminListResumeTemplates,
  adminToggleResumeTemplateStatus,
  adminUpdateResumeTemplate,
} from "@/lib/admin-resume-templates-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { AdminTokenState } from "../../_components/admin-token-state";
import { TemplateFileUpload } from "./_components/template-file-upload";

type AdminEditTemplatePageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminEditTemplatePage({
  params,
}: AdminEditTemplatePageProps) {
  const { id } = await params;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/templates/${id}`,
    );

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
    const state = buildAdminStateModel(
      "unexpected-error",
      `/admin/templates/${id}`,
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const template = templates.find((t) => t.id === id);

  if (!template) {
    notFound();
  }

  async function updateTemplate(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string | undefined;
    const targetRole = formData.get("targetRole") as string | undefined;

    await adminUpdateResumeTemplate(id, {
      name,
      slug,
      description: description?.trim() || undefined,
      targetRole: targetRole?.trim() || undefined,
    });

    revalidatePath(`/admin/templates/${id}`);
    revalidatePath("/admin/templates");
    redirect("/admin/templates");
  }

  async function toggleStatus() {
    "use server";
    await adminToggleResumeTemplateStatus(id);
    revalidatePath(`/admin/templates/${id}`);
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <AdminShellHeader
          actions={
            <div className="flex gap-3">
              <form action={toggleStatus}>
                <button
                  className={buttonVariants({ variant: "outline" })}
                  type="submit"
                >
                  {template.isActive ? "Desativar" : "Ativar"}
                </button>
              </form>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href="/admin/templates"
              >
                Voltar
              </Link>
            </div>
          }
          eyebrow="admin / templates de cv / editar"
          title={template.name}
        />

        <Card className="space-y-6">
          <form action={updateTemplate} className="space-y-6">
            <div className="space-y-2">
              <label
                className="block text-sm font-semibold text-stone-900"
                htmlFor="name"
              >
                Nome <span className="text-red-600">*</span>
              </label>
              <Input
                defaultValue={template.name}
                id="name"
                name="name"
                required
                type="text"
              />
            </div>

            <div className="space-y-2">
              <label
                className="block text-sm font-semibold text-stone-900"
                htmlFor="slug"
              >
                Slug <span className="text-red-600">*</span>
              </label>
              <Input
                defaultValue={template.slug}
                id="slug"
                name="slug"
                required
                type="text"
              />
              <p className="text-xs text-stone-500">
                Apenas letras minúsculas e hífens. Ex: classico-simples
              </p>
            </div>

            <div className="space-y-2">
              <label
                className="block text-sm font-semibold text-stone-900"
                htmlFor="description"
              >
                Descrição
              </label>
              <textarea
                className="h-24 w-full rounded-lg border border-stone-200 px-4 py-3 text-sm"
                defaultValue={template.description || ""}
                id="description"
                name="description"
              />
            </div>

            <div className="space-y-2">
              <label
                className="block text-sm font-semibold text-stone-900"
                htmlFor="targetRole"
              >
                Cargo alvo
              </label>
              <Input
                defaultValue={template.targetRole || ""}
                id="targetRole"
                name="targetRole"
                type="text"
              />
            </div>

            <div className="space-y-2">
              <label
                className="block text-sm font-semibold text-stone-900"
                htmlFor={`template-file-${template.id}`}
              >
                Arquivo do template (PDF)
              </label>
              <div id={`template-file-${template.id}`}>
                <TemplateFileUpload
                  currentFileUrl={template.fileUrl}
                  templateId={template.id}
                />
              </div>
              {template.previewImageUrl ? (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-green-700 font-medium">
                    Preview gerado automaticamente a partir do PDF.
                  </p>
                  <div className="relative h-96 w-72 overflow-hidden rounded border border-stone-200 shadow-sm">
                    <Image
                      src={template.previewImageUrl}
                      alt={`Preview do template ${template.name}`}
                      fill
                      unoptimized
                      className="object-cover object-top"
                    />
                  </div>
                </div>
              ) : template.fileUrl ? (
                <p className="text-xs text-amber-600 mt-2">
                  Arquivo salvo, mas a geração do preview falhou. Tente fazer o
                  upload novamente.
                </p>
              ) : null}
            </div>

            <div className="flex gap-3">
              <button className={buttonVariants()} type="submit">
                Salvar alterações
              </button>
              <Link
                className={buttonVariants({ variant: "outline" })}
                href="/admin/templates"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
