import { pollAnalysisJob } from "@/lib/analysis-job-polling";
import { analyzeGuestCv } from "@/lib/cv-adaptation-api";
import { setPendingGuestAnalysis } from "@/lib/guest-analysis-pending";
import { setGuestAnalysisRaw } from "@/lib/guest-analysis-storage";

export type GuestAnalysisFlowResult =
  | { kind: "gated"; destination: string }
  | { kind: "revealed"; destination: string }
  | { kind: "error"; error: string };

// Decisão de negócio pura do fluxo guest — mesma regra que existe hoje em
// apps/web/src/app/adaptar/adaptar-client.tsx (branch guest de handleSubmit),
// extraída aqui só o suficiente pra ter um único ponto de verdade sem
// arriscar refatorar o handler já validado na Fase 6. Sem estado React, sem
// UI, sem router.push — quem chama decide o que fazer com o destino/erro.
export async function runGuestAnalysisFlow(params: {
  formData: FormData;
  journeyContext: {
    sessionInternalId: string | null;
    visitorId: string | null;
  };
  guestAnalysisAuthGateEnabled: boolean;
}): Promise<GuestAnalysisFlowResult> {
  const started = await analyzeGuestCv(params.formData, params.journeyContext);
  if (!started.ok) {
    return { kind: "error", error: started.error };
  }

  if (params.guestAnalysisAuthGateEnabled) {
    if (started.guestPossessionToken) {
      setPendingGuestAnalysis({
        jobId: started.jobId,
        guestPossessionToken: started.guestPossessionToken,
      });
    }
    // noPreview=1 distingue esse redirect (guest nunca viu o resultado) do
    // CTA "Criar conta e liberar" em /adaptar/resultado, que também usa
    // ctx=analysis_guest mas com o guest já tendo visto a análise — ctx
    // segue só para tracking de conversão, sem mudar copy nenhuma.
    return {
      kind: "gated",
      destination: "/entrar?ctx=analysis_guest&noPreview=1",
    };
  }

  const result = await pollAnalysisJob(started.jobId);
  if (!result.ok) {
    return { kind: "error", error: result.error };
  }

  // Gate desligado: o preview em si continua vindo do conteúdo já
  // resolvido (setGuestAnalysisRaw, só pra renderizar a tela pro
  // visitante ainda anônimo) — mas o CLAIM pós-cadastro nunca deve usar
  // esse conteúdo como fonte. Guarda jobId+guestPossessionToken do mesmo
  // jeito que o caminho gated já faz, pra que register/login/social-callback
  // sempre reivindiquem pelo mesmo choke point canônico (claimGuestAnalysisJob),
  // nos dois estados da flag.
  if (started.guestPossessionToken) {
    setPendingGuestAnalysis({
      jobId: started.jobId,
      guestPossessionToken: started.guestPossessionToken,
    });
  }

  setGuestAnalysisRaw(
    JSON.stringify({
      ...result,
      guestSessionPublicToken: started.guestSessionPublicToken,
      jobDescriptionText: String(
        params.formData.get("jobDescriptionText") ?? "",
      ),
    }),
  );
  return { kind: "revealed", destination: "/adaptar/resultado" };
}
