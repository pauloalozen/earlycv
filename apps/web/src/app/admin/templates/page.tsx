import { revalidatePath } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminPill,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { EmptyState } from "@/components/ui";
import {
  type AdminResumeTemplateDto,
  adminListResumeTemplates,
  adminToggleResumeTemplateStatus,
} from "@/lib/admin-resume-templates-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Templates");

async function toggleStatus(id: string, _formData: FormData) {
  "use server";
  await adminToggleResumeTemplateStatus(id);
  revalidatePath("/admin/templates");
}

export default async function AdminTemplatesPage() {
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
    <AdminPageWrap>
      <AdminShellHeader
        actions={
          <Link className={buttonVariants()} href="/admin/templates/novo">
            + Novo template
          </Link>
        }
        eyebrow="admin · templates de cv"
        subtitle="Gerencie os templates disponíveis para adaptação de CV. Apenas templates ativos aparecem para o usuário final."
        title="Templates de CV."
      />

      {templates.length === 0 ? (
        <EmptyState
          description="Crie o primeiro template para ele aparecer na tela de adaptação."
          title="Nenhum template cadastrado"
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          {templates.map((template) => (
            <div
              key={template.id}
              style={{
                background: AT.card,
                border: `1px solid ${AT.border}`,
                borderRadius: 10,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Preview */}
              <div
                style={{
                  background: AT.bgAlt,
                  height: 200,
                  borderBottom: `1px solid ${AT.border}`,
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {template.previewImageUrl ? (
                  <Image
                    src={template.previewImageUrl}
                    alt={`Preview ${template.name}`}
                    fill
                    unoptimized
                    className="object-cover object-top"
                  />
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: AT.muted2,
                      textAlign: "center",
                      padding: "0 16px",
                    }}
                  >
                    Sem preview
                  </div>
                )}
                <div style={{ position: "absolute", top: 10, right: 10 }}>
                  <AdminPill tone={template.isActive ? "ok" : "neutral"} mono>
                    {template.isActive ? "ATIVO" : "INATIVO"}
                  </AdminPill>
                </div>
              </div>

              {/* Info */}
              <div
                style={{
                  padding: "14px 16px",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{ fontSize: 15, fontWeight: 600, color: AT.ink2 }}
                  >
                    {template.name}
                  </div>
                  <div
                    style={{
                      fontFamily: '"Geist Mono", monospace',
                      fontSize: 11,
                      color: AT.muted2,
                    }}
                  >
                    {template.slug}
                  </div>
                </div>

                {template.description && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: AT.muted,
                      lineHeight: 1.4,
                      marginBottom: 8,
                    }}
                  >
                    {template.description}
                  </div>
                )}

                {template.targetRole && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11.5,
                      color: AT.muted2,
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: '"Geist Mono", monospace',
                        letterSpacing: 0.6,
                      }}
                    >
                      CARGO ALVO
                    </span>
                    <span style={{ color: AT.ink2, fontWeight: 500 }}>
                      {template.targetRole}
                    </span>
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                  <Link
                    className={buttonVariants({ size: "sm" })}
                    href={`/admin/templates/${template.id}`}
                  >
                    Editar
                  </Link>
                  <form action={toggleStatus.bind(null, template.id)}>
                    <button
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      type="submit"
                    >
                      {template.isActive ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPageWrap>
  );
}
