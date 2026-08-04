"use server";

import { redirect } from "next/navigation";

import {
  cancelManualRun,
  createCompany,
  createJobSource,
  deleteJobSource,
  importCompanySourcesCsv,
  runGlobalSchedulerNow,
  runJobSourceAdHoc,
  startManualAdapterRun,
  updateGlobalSchedulerConfig,
  updateJobSource,
} from "@/lib/admin-ingestion-api";
import {
  buildAdminRedirect,
  isRedirectControlFlowError,
  parseCompanyFormData,
  parseJobSourceFormData,
  parseManualAdapterType,
  parseManualBatchRunId,
  parseUpdateJobSourceFormData,
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
    await runJobSourceAdHoc(jobSourceId);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Falha ao disparar ingestao.";

    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      "Job disparado. Acompanhe o progresso na aba Jobs.",
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
      await runJobSourceAdHoc(source.id);
    } catch (error) {
      if (isRedirectControlFlowError(error)) {
        throw error;
      }

      const message =
        error instanceof Error
          ? `Fonte criada, mas o disparo manual falhou: ${error.message}`
          : "Fonte criada, mas o disparo manual falhou.";

      redirect(buildAdminRedirect(ROOT_REDIRECT_PATH, "error", message));
    }

    redirect(
      buildAdminRedirect(
        ROOT_REDIRECT_PATH,
        "success",
        `Fonte ${source.sourceName} criada e job disparado. Acompanhe na aba Jobs.`,
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
    const label = dryRun ? "Dry-run" : "Importacao";
    const hasSuccess = report.summary.successCount > 0;

    if (!hasSuccess && report.summary.errorCount > 0) {
      const firstErrors = report.lines
        .filter((line) => line.status === "error")
        .slice(0, 3)
        .map(
          (line) => `linha ${line.line} (${line.companyName}): ${line.message}`,
        )
        .join("; ");

      redirect(
        buildAdminRedirect(
          redirectPath,
          "error",
          `${label} falhou: ${report.summary.errorCount} erro(s), 0 sucesso(s). ${firstErrors}`,
        ),
      );
    }

    redirect(
      buildAdminRedirect(
        redirectPath,
        "success",
        `${label} concluido: ${report.summary.successCount} sucesso(s), ${report.summary.errorCount} erro(s).`,
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
      error instanceof Error
        ? error.message
        : "Falha ao salvar scheduler global.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(redirectPath, "success", "Scheduler global atualizado."),
  );
}

export async function updateJobSourceScheduleAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );
  const jobSourceId = String(formData.get("jobSourceId") ?? "").trim();

  if (!jobSourceId) {
    redirect(buildAdminRedirect(redirectPath, "error", "Informe a fonte."));
  }

  const scheduleEnabled = formData.get("scheduleEnabled") === "on";
  const scheduleCron = String(formData.get("scheduleCron") ?? "").trim();
  const schedulePayload = scheduleEnabled
    ? {
        scheduleCron: scheduleCron || "*/30 * * * *",
        scheduleEnabled: true,
        scheduleTimezone: "America/Sao_Paulo" as const,
      }
    : {
        scheduleCron: null,
        scheduleEnabled: false,
      };

  try {
    await updateJobSource(jobSourceId, schedulePayload);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao atualizar agendamento da fonte.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      "Agendamento da fonte atualizado.",
    ),
  );
}

export async function updateJobSourceAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );
  const jobSourceId = String(formData.get("jobSourceId") ?? "").trim();

  if (!jobSourceId) {
    redirect(buildAdminRedirect(redirectPath, "error", "Informe a fonte."));
  }

  try {
    const payload = parseUpdateJobSourceFormData(formData);
    await updateJobSource(jobSourceId, payload);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Falha ao atualizar a fonte.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      "Fonte atualizada com sucesso.",
    ),
  );
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
        `Execucao global enfileirada (${result.totalSources} fonte(s) com agendamento ativo). Acompanhe em Execucoes manuais.`,
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
    const message =
      error instanceof Error ? error.message : "Falha ao excluir fonte.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(redirectPath, "success", "Fonte excluida com sucesso."),
  );
}

export async function startManualAdapterRunAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );
  let adapterType: ReturnType<typeof parseManualAdapterType>;
  try {
    adapterType = parseManualAdapterType(formData.get("adapterType"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tipo de adaptador invalido.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  try {
    await startManualAdapterRun(adapterType);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Falha ao iniciar execucao manual do adaptador.";

    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      "Execucao manual iniciada em background.",
    ),
  );
}

export async function toggleScheduleEnabledAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );
  const jobSourceId = String(formData.get("jobSourceId") ?? "").trim();
  const scheduleEnabled = String(formData.get("scheduleEnabled")) === "true";

  if (!jobSourceId) {
    redirect(buildAdminRedirect(redirectPath, "error", "Informe a fonte."));
  }

  try {
    await updateJobSource(jobSourceId, { scheduleEnabled });
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao atualizar agendamento.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }
}

export async function cancelManualRunAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? `${ROOT_REDIRECT_PATH}`,
  );
  let batchRunId: string;
  try {
    batchRunId = parseManualBatchRunId(formData.get("batchRunId"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Informe o lote manual.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  try {
    await cancelManualRun(batchRunId);
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Falha ao solicitar cancelamento.";

    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(redirectPath, "success", "Cancelamento solicitado."),
  );
}
