import { analyzeGuestCv } from "./cv-adaptation-api";
import { setPendingGuestAnalysis } from "./guest-analysis-pending";
import {
  pollRadarAnalysisPreview,
  type SucceededRadarAnalysisPreview,
} from "./radar-guest-analysis-preview";

export type RadarGuestAnalysisFlowResult =
  | { kind: "preview"; jobId: string; preview: SucceededRadarAnalysisPreview }
  | { kind: "error"; error: string };

// Fluxo guest específico da Fase 1 de conversão do Radar (/radar/[slug]).
// Reaproveita analyzeGuestCv (mesmo endpoint POST /cv-adaptation/
// analyze-guest, mesmo AnalysisJob, mesmo pipeline de processamento) e
// setPendingGuestAnalysis (mesma chave sessionStorage "guest_analysis_pending"
// que login-form/register-form/social-callback já leem pra fazer o claim
// pós-signup) — nunca duplica essa lógica.
//
// Nunca chama runGuestAnalysisFlow (guest-analysis-flow.ts): aquele fluxo
// sempre termina redirecionando pra /entrar (gate ligado) ou revelando o
// CvAdaptationOutput completo (gate desligado) — nenhum dos dois serve o
// requisito do Radar, que é mostrar um preview limitado NA MESMA PÁGINA
// antes de qualquer redirect. Por isso o polling aqui usa
// pollRadarAnalysisPreview (radar-guest-analysis-preview.ts), que nunca
// busca o adaptedContentJson completo — só score/breakdown/gapsCount.
export async function runRadarGuestAnalysisFlow(params: {
  formData: FormData;
  journeyContext: {
    sessionInternalId: string | null;
    visitorId: string | null;
  };
}): Promise<RadarGuestAnalysisFlowResult> {
  const started = await analyzeGuestCv(params.formData, params.journeyContext);
  if (!started.ok) {
    return { kind: "error", error: started.error };
  }

  if (!started.guestPossessionToken) {
    return {
      kind: "error",
      error: "Falha ao iniciar a análise. Tente novamente.",
    };
  }

  setPendingGuestAnalysis({
    jobId: started.jobId,
    guestPossessionToken: started.guestPossessionToken,
  });

  const result = await pollRadarAnalysisPreview(
    started.jobId,
    started.guestPossessionToken,
  );

  if (!result.ok) {
    return { kind: "error", error: result.error };
  }

  return { kind: "preview", jobId: started.jobId, preview: result.preview };
}
