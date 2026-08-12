import { pollAnalysisJob } from "./analysis-job-polling";
import { analyzeAuthenticatedCv, saveGuestPreview } from "./cv-adaptation-api";
import { appendTurnstileTokenToAnalyzeFormData } from "./cv-adaptation-flow-helpers";

export type AnalyzeMasterCvForJobResult =
  | { ok: true; adaptationId: string }
  | { ok: false; error: string };

// Fluxo de 1 clique a partir do card de vaga (/radar, /radar/[slug]): usa o
// CV Master do usuário logado direto, sem passar por /adaptar. Espelha a
// orquestração (analisar -> poll -> salvar preview) que /adaptar já faz para
// o caso "autenticado com masterResumeId", mas sem os outros modos de
// entrada de CV (upload/texto/perfil) que não se aplicam aqui.
export async function analyzeMasterCvForJob(params: {
  masterResumeId: string;
  radarJobId: string;
  jobDescriptionText: string;
  turnstileToken: string | null;
}): Promise<AnalyzeMasterCvForJobResult> {
  const formData = new FormData();
  formData.append("masterResumeId", params.masterResumeId);
  formData.append("radarJobId", params.radarJobId);
  appendTurnstileTokenToAnalyzeFormData(formData, params.turnstileToken);

  const started = await analyzeAuthenticatedCv(formData);
  if (!started.ok) {
    return { ok: false, error: started.error };
  }

  const result = await pollAnalysisJob(started.jobId);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  try {
    const saved = await saveGuestPreview({
      adaptedContentJson: result.adaptedContentJson,
      companyName: result.adaptedContentJson?.vaga?.empresa,
      jobTitle: result.adaptedContentJson?.vaga?.cargo,
      jobDescriptionText: params.jobDescriptionText,
      masterCvText: result.masterCvText,
      analysisCvSnapshotId: result.analysisCvSnapshotId,
      previewText: result.previewText,
      radarJobId: params.radarJobId,
    });
    return { ok: true, adaptationId: saved.id };
  } catch {
    return {
      ok: false,
      error: "Falha ao salvar a análise. Tente novamente.",
    };
  }
}
