"use server";

import { redirect } from "next/navigation";

import {
  createCompany,
  createJobSource,
  runJobSource,
} from "@/lib/admin-ingestion-api";
import {
  buildAdminRedirect,
  isRedirectControlFlowError,
  parseCompanyFormData,
  parseJobSourceFormData,
} from "@/lib/admin-ingestion-flow";

const ROOT_REDIRECT_PATH = "/admin/ingestion";
const NEW_SOURCE_REDIRECT_PATH = "/admin/ingestion/new";

export async function runJobSourceAction(formData: FormData) {
  const jobSourceId = String(formData.get("jobSourceId") ?? "").trim();
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );

  if (!jobSourceId) {
    redirect(buildAdminRedirect(redirectPath, "error", "Informe a fonte."));
  }

  try {
    await runJobSource(jobSourceId);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Falha ao executar ingestao.";

    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      "Ingestao executada com sucesso.",
    ),
  );
}

export async function createCompanyAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${NEW_SOURCE_REDIRECT_PATH}`,
  );

  let company: Awaited<ReturnType<typeof createCompany>>;

  try {
    company = await createCompany(parseCompanyFormData(formData));
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Falha ao criar a empresa.";

    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(redirectPath, "success", "Empresa criada com sucesso.", {
      companyId: company.id,
      companyName: company.name,
      step: "job-source",
    }),
  );
}

export async function createJobSourceAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${NEW_SOURCE_REDIRECT_PATH}`,
  );

  let source: Awaited<ReturnType<typeof createJobSource>>;

  try {
    const payload = parseJobSourceFormData(formData);
    source = await createJobSource(payload);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Falha ao criar a fonte.";
    const companyId = String(formData.get("companyId") ?? "").trim();
    const companyName = String(formData.get("companyName") ?? "").trim();

    redirect(
      buildAdminRedirect(redirectPath, "error", message, {
        ...(companyId ? { companyId } : {}),
        ...(companyName ? { companyName } : {}),
        step: "job-source",
      }),
    );
  }

  redirect(
    buildAdminRedirect(
      ROOT_REDIRECT_PATH,
      "success",
      `Fonte ${source.sourceName} criada com sucesso.`,
    ),
  );
}
