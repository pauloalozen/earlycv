"use server";

import { revalidatePath } from "next/cache";

import { reenrichJob, runEnrichmentNow } from "@/lib/admin-semantic-filter-api";

// Enriquecimento individual inline na listagem de vagas do run: reseta a
// vaga pra PENDING e dispara o worker imediatamente, mesmo mecanismo do
// botao "Enriquecer agora" da listagem unificada (/admin/ingestion/filter).
export async function enrichJobNowAction(formData: FormData) {
  const jobEnrichmentId = String(formData.get("jobEnrichmentId") ?? "");
  const jobSourceId = String(formData.get("jobSourceId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  if (!jobEnrichmentId || !jobSourceId || !runId) return;

  await reenrichJob(jobEnrichmentId);
  await runEnrichmentNow();
  revalidatePath(`/admin/ingestion/${jobSourceId}/runs/${runId}`);
}
