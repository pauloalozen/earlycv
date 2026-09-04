import { pollAnalysisJob } from "@/lib/analysis-job-polling";
import {
  analyzeAuthenticatedCv,
  saveGuestPreview,
} from "@/lib/cv-adaptation-api";

export type AuthenticatedAnalysisFlowResult =
  | { kind: "revealed"; destination: string }
  | { kind: "error"; error: string };

// Contraparte autenticada de runGuestAnalysisFlow (guest-analysis-flow.ts) —
// usada quando quem envia a análise na landing já está logado: sem gate,
// sem claim, sem sessionStorage. analyzeAuthenticatedCv já cria o
// AnalysisJob vinculado ao usuário (via JWT); saveGuestPreview materializa
// a CvAdaptation a partir do conteúdo já processado, mesmo passo que
// /adaptar usa para usuário autenticado.
export async function runAuthenticatedAnalysisFlow(params: {
  formData: FormData;
  inputMode: "file_upload" | "text_paste";
  journeyContext: {
    sessionInternalId: string | null;
    visitorId: string | null;
  };
}): Promise<AuthenticatedAnalysisFlowResult> {
  const started = await analyzeAuthenticatedCv(
    params.formData,
    params.inputMode,
    params.journeyContext,
  );
  if (!started.ok) {
    return { kind: "error", error: started.error };
  }

  const result = await pollAnalysisJob(started.jobId);
  if (!result.ok) {
    return { kind: "error", error: result.error };
  }

  try {
    const saved = await saveGuestPreview({
      adaptedContentJson: result.adaptedContentJson,
      previewText: result.previewText,
      jobDescriptionText: String(
        params.formData.get("jobDescriptionText") ?? "",
      ),
      masterCvText: result.masterCvText,
      analysisCvSnapshotId: result.analysisCvSnapshotId,
      jobTitle: result.jobTitle ?? result.adaptedContentJson?.vaga?.cargo,
      companyName:
        result.companyName ?? result.adaptedContentJson?.vaga?.empresa,
      sessionInternalId: params.journeyContext.sessionInternalId,
      visitorId: params.journeyContext.visitorId,
    });
    return {
      kind: "revealed",
      destination: `/adaptar/resultado?adaptationId=${saved.id}`,
    };
  } catch {
    return {
      kind: "error",
      error: "Não foi possível salvar sua análise. Tente novamente.",
    };
  }
}
