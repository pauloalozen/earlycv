"use server";

import { revalidatePath } from "next/cache";

import {
  createSemanticFilterConfigVersion,
  forceRunEnrichmentNowForJob,
  reenrichJob,
  runEnrichmentNowForJob,
} from "@/lib/admin-semantic-filter-api";

export type FilterActionUiResult = {
  kind: "error" | "success";
  message: string;
};

function parseErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Falha de rede. Tente novamente.";
  }
  if (error.message.includes("API 401") || error.message.includes("API 403")) {
    return "Acesso negado para esta operacao.";
  }
  return "Falha de rede ou servidor. Tente novamente.";
}

function parseLines(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function saveSemanticFilterConfigVersionAction(
  _prevState: FilterActionUiResult | null,
  formData: FormData,
): Promise<FilterActionUiResult> {
  try {
    const techSignals = parseLines(String(formData.get("techSignals") ?? ""));
    const noiseSignals = parseLines(String(formData.get("noiseSignals") ?? ""));
    const description = String(formData.get("description") ?? "").trim();

    if (techSignals.length === 0 || noiseSignals.length === 0) {
      return {
        kind: "error",
        message: "techSignals e noiseSignals precisam ter ao menos um item.",
      };
    }

    const created = await createSemanticFilterConfigVersion({
      description: description || undefined,
      noiseSignals,
      techSignals,
    });

    revalidatePath("/admin/ingestion/filter");

    return {
      kind: "success",
      message: `Nova versao ${created.version} criada e ativada.`,
    };
  } catch (error) {
    return { kind: "error", message: parseErrorMessage(error) };
  }
}

// Marca a vaga como PENDING (reenrichJob reseta status/attempts) e processa
// ela especificamente na hora (runEnrichmentNowForJob), pra vagas
// PENDING/FAILED na listagem unificada — nao entra na fila FIFO geral.
export async function enrichNowFormAction(formData: FormData) {
  const jobEnrichmentId = String(formData.get("jobEnrichmentId") ?? "");
  if (!jobEnrichmentId) return;

  await reenrichJob(jobEnrichmentId);
  await runEnrichmentNowForJob(jobEnrichmentId);
  revalidatePath("/admin/ingestion/filter");
}

// Forca o enriquecimento via LLM ignorando o resultado do filtro semantico
// — pra vagas SKIPPED onde o admin revisou e discorda da decisao do filtro.
export async function forceEnrichFormAction(formData: FormData) {
  const jobEnrichmentId = String(formData.get("jobEnrichmentId") ?? "");
  if (!jobEnrichmentId) return;

  await reenrichJob(jobEnrichmentId);
  await forceRunEnrichmentNowForJob(jobEnrichmentId);
  revalidatePath("/admin/ingestion/filter");
}
