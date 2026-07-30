"use server";

import { revalidatePath } from "next/cache";

import {
  reenrichJob,
  runEnrichmentNowForJob,
} from "@/lib/admin-semantic-filter-api";

// Enriquecimento individual inline na listagem de vagas do run: reseta a
// vaga pra PENDING e processa ela especificamente na hora (nao entra na
// fila FIFO geral), mesmo mecanismo do botao "Enriquecer agora" da
// listagem unificada (/admin/ingestion/filter).
export async function enrichJobNowAction(formData: FormData) {
  const jobEnrichmentId = String(formData.get("jobEnrichmentId") ?? "");
  const jobSourceId = String(formData.get("jobSourceId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  if (!jobEnrichmentId || !jobSourceId || !runId) return;

  await reenrichJob(jobEnrichmentId);
  await runEnrichmentNowForJob(jobEnrichmentId);
  revalidatePath(`/admin/ingestion/${jobSourceId}/runs/${runId}`);
}
