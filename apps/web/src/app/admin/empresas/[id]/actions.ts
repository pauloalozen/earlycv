"use server";

import { redirect } from "next/navigation";

import { deleteCompany } from "@/lib/admin-ingestion-api";
import {
  buildAdminRedirect,
  isRedirectControlFlowError,
} from "@/lib/admin-ingestion-flow";

export async function deleteCompanyAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "").trim();

  if (!companyId) {
    redirect(buildAdminRedirect("/admin/empresas", "error", "Empresa ausente."));
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
    buildAdminRedirect("/admin/empresas", "success", "Empresa excluida com sucesso."),
  );
}
