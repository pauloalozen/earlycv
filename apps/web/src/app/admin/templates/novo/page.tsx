import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants, Card, Input } from "@/components/ui";
import { adminCreateResumeTemplate } from "@/lib/admin-resume-templates-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { AdminShellHeader } from "../../_components/admin-shell-header";
import { AdminTokenState } from "../../_components/admin-token-state";

export default async function AdminNewTemplatePage() {
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      "/admin/templates/novo",
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  async function createTemplate(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string | undefined;
    const targetRole = formData.get("targetRole") as string | undefined;

    await adminCreateResumeTemplate({
      name,
      slug,
      description: description?.trim() || undefined,
      targetRole: targetRole?.trim() || undefined,
    });

    redirect("/admin/templates");
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / templates de cv / novo"
          title="Novo Template"
        />

        <Card className="space-y-6">
          <form action={createTemplate} className="space-y-6">
            <div className="space-y-2">
              <label
                className="block text-sm font-semibold text-stone-900"
                htmlFor="name"
              >
                Nome <span className="text-red-600">*</span>
              </label>
              <Input
                id="name"
                name="name"
                placeholder="Ex: Clássico Simples"
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
                id="slug"
                name="slug"
                placeholder="Ex: classico-simples"
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
                id="description"
                name="description"
                placeholder="Ex: Template minimalista com foco em experiência"
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
                id="targetRole"
                name="targetRole"
                placeholder="Ex: Senior Software Engineer"
                type="text"
              />
            </div>

            <div className="flex gap-3">
              <button className={buttonVariants()} type="submit">
                Criar template
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
