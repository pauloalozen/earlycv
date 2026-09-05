// Flag única do pipeline de perfil canônico de CV (Fase 2), seguindo a
// convenção já usada no projeto (ex: MASTER_CV_CANONICAL_EXTRACTION_ENABLED,
// WEB_SEARCH_ENABLED, GOOGLE_INDEXING_ENABLED): variável de ambiente booleana
// lida diretamente via process.env, comparação estrita com "true", default
// desligado. Ver docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md.
//
// Desligada (default): os entrypoints legados que hoje disparam
// MasterCvCanonicalExtractionService.enqueueFromMasterResumeUpload()
// continuam funcionando exatamente como hoje — nenhum código legado é
// removido ou alterado nesta fase.
//
// Correção (Fase 2, relatório final): cv-adaptation.service.ts#
// triggerMasterCvExtraction (privado, chamado por analyzeAuthenticated,
// create, claimGuest e outros pontos quando dto.saveAsMaster/promoção de
// Master está envolvida) NÃO está coberto por este flag até a Fase 2C —
// ele só chama o serviço legado, fire-and-forget (.catch, sem await),
// nunca o pipeline novo. Ele passa a criar/depender de CvProcessingJob
// somente a partir da Fase 2C (ver cv-processing.worker.ts e
// cv-adaptation.service.ts#analyzeAuthenticated). Até lá, mesmo com a
// flag ligada, análise autenticada (com ou sem promoção de Master) segue
// 100% no caminho legado — só resumes.service.ts#create usa o pipeline
// novo (Fase 2A).
//
// Ligada: resumes.service.ts#create (Fase 2A) e, a partir da Fase 2C,
// cv-adaptation.service.ts#analyzeAuthenticated (análise autenticada,
// com ou sem promoção de Master) passam a criar CvSource + CvSubmission +
// CvProcessingJob (novo caminho, processado por CvProcessingWorker em ciclo
// de cron separado, nunca por Promise fire-and-forget dentro do request).
export function isCvStructuredProfilePipelineEnabled(): boolean {
  return process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED === "true";
}
