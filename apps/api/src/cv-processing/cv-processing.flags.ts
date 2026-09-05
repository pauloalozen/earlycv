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
// Correção (Fase 2F, relatório final — atualiza a correção da Fase 2B, que
// dizia respeito só ao estado pós-2C): cv-adaptation.service.ts#
// triggerMasterCvExtraction (privado — chamado por create(), claimGuest()
// e saveGuestPreview(), sempre que um upload/texto colado vira/permanece
// Master fora do fluxo de análise assíncrona) NUNCA passou a ser coberto
// por este flag, em NENHUMA fase (1 a 2E) — continua, hoje, chamando só o
// serviço legado (MasterCvCanonicalExtractionService), fire-and-forget
// (.catch, sem await), com a flag ligada ou desligada. Isso é esperado, não
// uma lacuna: create()/claimGuest()/saveGuestPreview() são os entrypoints
// SÍNCRONOS de análise (analyzeGuest/claimGuest) e de materialização do
// claim legado (saveGuestPreview) — nenhum deles foi migrado para o
// pipeline assíncrono por CvProcessingJob; só os entrypoints ASSÍNCRONOS
// (startGuestAnalysisJob/startAuthenticatedAnalysisJob, e o claim granular
// dentro de claimGuestAnalysisJob) o foram, um por fase:
//
// - Fase 2A: resumes.service.ts#create (upload dedicado de Master em
//   /meu-cv-master) — cria CvSource+CvSubmission+CvProcessingJob quando a
//   flag está ligada, senão só o legado.
// - Fase 2C (+ 2C.1 pro inputMode "profile"): cv-adaptation.service.ts#
//   startAuthenticatedAnalysisJob (POST /cv-adaptation/analyze) passa a
//   desviar pro pipeline novo (startAuthenticatedAnalysisJobCanonical)
//   quando a flag está ligada — análise autenticada, com ou sem promoção
//   de Master. Flag desligada: 100% legado, inclusive o
//   triggerMasterCvExtraction fire-and-forget de sempre.
// - Fase 2D: cv-adaptation.service.ts#startGuestAnalysisJob
//   (POST /cv-adaptation/analyze-guest) ganha o mesmo desvio
//   (startGuestAnalysisJobCanonical) — sujeito é um TalentSubject, nunca um
//   User; Master provisório via PROMOTE_IF_FIRST.
// - Fase 2E: dentro de claimGuestAnalysisJob (POST /cv-adaptation/
//   analysis-jobs/:jobId/claim), quando a AnalysisJob reivindicada tem
//   cvProcessingJobId preenchido (passou pelas Fases 2C/2D acima) E a flag
//   está ligada, roda ClaimSourceGrantService.claim() (grant granular por
//   fonte + Master/UserProfile/projeção quando aplicável) ALÉM do claim
//   legado (saveGuestPreview, que continua sendo o único caminho que
//   materializa o CvAdaptation exibido no dashboard — e que, por sua vez,
//   ainda chama triggerMasterCvExtraction legado quando promove Master).
//
// claimGuest() (POST /cv-adaptation/claim-guest — endpoint de resgate de
// crédito, distinto de claimGuestAnalysisJob) e a rota POST /cv-adaptation
// (create(), upload direto com geração de adaptação síncrona) nunca foram
// tocados por nenhuma fase — seguem 100% no legado, com ou sem a flag,
// porque nenhum plano de fase os incluiu como entrypoint de destino
// (ver matriz completa no relatório da Fase 2F).
//
// Ligada: resumes.service.ts#create (Fase 2A),
// cv-adaptation.service.ts#startAuthenticatedAnalysisJob (Fase 2C/2C.1) e
// #startGuestAnalysisJob (Fase 2D) passam a criar CvSource + CvSubmission +
// CvProcessingJob (novo caminho, processado por CvProcessingWorker em ciclo
// de cron separado, nunca por Promise fire-and-forget dentro do request);
// claimGuestAnalysisJob (Fase 2E) passa a rodar o claim granular quando a
// AnalysisJob envolvida veio de um desses dois entrypoints.
export function isCvStructuredProfilePipelineEnabled(): boolean {
  return process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED === "true";
}
