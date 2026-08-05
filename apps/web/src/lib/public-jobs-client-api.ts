"use server";

import { apiRequest } from "./api-request";
import type { PublicJob } from "./public-jobs-api";

// Server action dedicada — public-jobs-api.ts é "server-only" (só roda em
// Server Components), mas /adaptar é client component e precisa buscar a
// vaga a partir do jobId da URL pra pré-preencher a descrição (fluxo de 1
// clique a partir do Radar). jobId inválido ou vaga inativa: retorna null,
// e quem chama trata isso como "sem pré-preenchimento" (falha silenciosa).
export async function getPublicJobById(
  jobId: string,
): Promise<PublicJob | null> {
  try {
    const response = await apiRequest("GET", `/public/jobs/by-id/${jobId}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as PublicJob;
  } catch {
    return null;
  }
}
