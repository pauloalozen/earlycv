import { pollAnalysisJob } from "./analysis-job-polling";
import { analyzeAuthenticatedCv, saveGuestPreview } from "./cv-adaptation-api";
import { appendTurnstileTokenToAnalyzeFormData } from "./cv-adaptation-flow-helpers";
import { getJourneySessionInternalId } from "./journey-session";
import { getOrCreateVisitorId } from "./visitor-id";

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

  // analyzeAuthenticatedCv/saveGuestPreview são Server Actions — rodam no
  // servidor Next.js, sem acesso a sessionStorage/localStorage. Precisam
  // receber sessionInternalId/visitorId explicitamente daqui (lidos no
  // client), senão o backend nunca vê esses headers e analysis_started/
  // completed/candidatura_created ficam sem correlação de jornada — mesmo
  // fix já aplicado em /adaptar/page.tsx, este é o outro caller.
  const journeyContext = {
    sessionInternalId: getJourneySessionInternalId(),
    visitorId: getOrCreateVisitorId(),
  };

  const started = await analyzeAuthenticatedCv(
    formData,
    undefined,
    journeyContext,
  );
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
      // Prioriza o cargo/empresa curados do Radar (result.jobTitle/
      // companyName, resolvidos server-side a partir do Job) sobre o que a
      // IA reextraiu do texto colado — a IA raramente repete o nome da
      // empresa no corpo da descrição colada, então falha silenciosamente
      // mesmo com o dado real disponível no Job do Radar.
      companyName:
        result.companyName ?? result.adaptedContentJson?.vaga?.empresa,
      jobTitle: result.jobTitle ?? result.adaptedContentJson?.vaga?.cargo,
      jobDescriptionText: params.jobDescriptionText,
      masterCvText: result.masterCvText,
      analysisCvSnapshotId: result.analysisCvSnapshotId,
      previewText: result.previewText,
      radarJobId: params.radarJobId,
      sessionInternalId: journeyContext.sessionInternalId,
      visitorId: journeyContext.visitorId,
    });
    return { ok: true, adaptationId: saved.id };
  } catch {
    return {
      ok: false,
      error: "Falha ao salvar a análise. Tente novamente.",
    };
  }
}
