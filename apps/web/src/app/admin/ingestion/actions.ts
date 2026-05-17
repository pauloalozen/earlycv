"use server";

import { redirect } from "next/navigation";

import {
  createCompany,
  createJobSource,
  deleteJobSource,
  importCompanySourcesCsv,
  runJobSource,
  runGlobalSchedulerNow,
  updateGlobalSchedulerConfig,
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
  const runAfterCreate = formData.get("runAfterCreate") === "on";

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

  if (runAfterCreate) {
    try {
      await runJobSource(source.id);
    } catch (error) {
      if (isRedirectControlFlowError(error)) {
        throw error;
      }

      const message =
        error instanceof Error
          ? `Fonte criada, mas a execucao manual falhou: ${error.message}`
          : "Fonte criada, mas a execucao manual falhou.";

      redirect(buildAdminRedirect(ROOT_REDIRECT_PATH, "error", message));
    }

    redirect(
      buildAdminRedirect(
        ROOT_REDIRECT_PATH,
        "success",
        `Fonte ${source.sourceName} criada e executada com sucesso.`,
      ),
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

export async function importCompanySourcesCsvAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );
  const dryRun = String(formData.get("dryRun") ?? "true") === "true";
  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    redirect(buildAdminRedirect(redirectPath, "error", "Arquivo CSV ausente."));
  }

  try {
    const report = await importCompanySourcesCsv({ dryRun, file: fileEntry });
    redirect(
      buildAdminRedirect(
        redirectPath,
        "success",
        `${dryRun ? "Dry-run" : "Importacao"} concluido: ${report.summary.successCount} sucesso(s), ${report.summary.errorCount} erro(s).`,
      ),
    );
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Falha ao importar CSV.";

    redirect(buildAdminRedirect(redirectPath, "error", message));
  }
}

export async function updateGlobalSchedulerAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );

  try {
    await updateGlobalSchedulerConfig({
      enabled: formData.get("enabled") === "on",
      errorDelayMs: Number(formData.get("errorDelayMs") ?? 90000),
      globalCron: String(formData.get("globalCron") ?? "").trim() || undefined,
      normalDelayMs: Number(formData.get("normalDelayMs") ?? 45000),
      timezone: "America/Sao_Paulo",
    });
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Falha ao salvar scheduler global.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(buildAdminRedirect(redirectPath, "success", "Scheduler global atualizado."));
}

export async function runGlobalSchedulerNowAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );

  try {
    const result = await runGlobalSchedulerNow();
    redirect(
      buildAdminRedirect(
        redirectPath,
        "success",
        `Execucao global: ${result.status}.`,
      ),
    );
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao executar scheduler global.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }
}

export async function deleteJobSourceAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );
  const jobSourceId = String(formData.get("jobSourceId") ?? "").trim();

  if (!jobSourceId) {
    redirect(buildAdminRedirect(redirectPath, "error", "Informe a fonte."));
  }

  try {
    await deleteJobSource(jobSourceId);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Falha ao excluir fonte.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(buildAdminRedirect(redirectPath, "success", "Fonte excluida com sucesso."));
}
