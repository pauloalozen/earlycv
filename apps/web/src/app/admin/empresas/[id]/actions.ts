"use server";

import { redirect } from "next/navigation";

import { deleteCompany, updateCompany } from "@/lib/admin-ingestion-api";
import {
  buildAdminRedirect,
  isRedirectControlFlowError,
} from "@/lib/admin-ingestion-flow";

export async function deleteCompanyAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "").trim();

  if (!companyId) {
    redirect(
      buildAdminRedirect("/admin/empresas", "error", "Empresa ausente."),
    );
  }

  try {
    await deleteCompany(companyId);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Falha ao excluir empresa.";
    redirect(
      buildAdminRedirect(`/admin/empresas/${companyId}`, "error", message),
    );
  }

  redirect(
    buildAdminRedirect(
      "/admin/empresas",
      "success",
      "Empresa excluida com sucesso.",
    ),
  );
}

// Nome de exibição da empresa nas páginas públicas (vaga, landing de
// empresa). Vazio volta para o nome calculado a partir da razão social.
export async function updateCompanyDisplayNameAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const redirectPath = `/admin/empresas/${companyId}`;

  if (!companyId) {
    redirect(
      buildAdminRedirect("/admin/empresas", "error", "Empresa ausente."),
    );
  }

  try {
    await updateCompany(companyId, { displayName: displayName || null });
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Falha ao salvar o nome de exibição.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      displayName
        ? `Nome de exibição salvo: "${displayName}".`
        : "Nome de exibição removido. As páginas voltam a usar o nome calculado.",
    ),
  );
}
