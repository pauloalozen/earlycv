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
// Correção (Fase 2G, relatório final — substitui a correção da Fase 2F,
// que dizia que os três abaixo "nunca foram tocados por nenhuma fase" e
// seguiam "100% no legado, com ou sem a flag"): auditados na Fase 2G e
// confirmados VIVOS no frontend — create() (POST /cv-adaptation) é o único
// morto (sem nenhum caller real em apps/web/src, confirmado por busca:
// createCvAdaptation/createCvAdaptationFromMaster em lib/cv-adaptation-api.ts
// não têm import algum fora do próprio arquivo). claimGuest() (POST
// /cv-adaptation/claim-guest, resgate de crédito) é chamado por
// apps/web/src/app/adaptar/resultado/page.tsx. saveGuestPreview() (POST
// /cv-adaptation/save-guest-preview) é o fluxo principal de conversão
// guest->conta — chamado por adaptar-client.tsx, adaptar/resultado/page.tsx,
// adaptacao-cv-client.tsx, dashboard/guest-analysis-claimer.tsx via
// lib/analyze-master-cv-flow.ts e lib/authenticated-analysis-flow.ts.
//
// Por isso, na Fase 2G, os três passaram a chamar TAMBÉM
// #enqueueCanonicalMasterProcessing (awaited, ao lado de
// triggerMasterCvExtraction — nunca substituindo-o) sempre que criam/
// promovem um Resume master, com a flag ligada. Continua verdade que
// triggerMasterCvExtraction em si nunca foi alterado (ainda dispara só o
// legado, fire-and-forget) — a integração nova é uma chamada adicional, não
// uma substituição:
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
// - Fase 2G: create()/claimGuest()/saveGuestPreview() (POST /cv-adaptation,
//   POST /cv-adaptation/claim-guest, POST /cv-adaptation/save-guest-preview)
//   passam a chamar #enqueueCanonicalMasterProcessing (awaited) sempre que
//   criam/promovem um Resume master — PROMOTE_IF_FIRST no caso comum
//   (primeiro CV do usuário, o único caso em claimGuest()/no ramo sem
//   arquivo de saveGuestPreview()), PROMOTE_EXPLICIT quando dto.saveAsMaster
//   === true (substituição explícita, só existe no ramo com arquivo de
//   create()/saveGuestPreview()). resumes.service.ts#setPrimary
//   (POST /resumes/:id/set-primary) passa a integrar o pipeline canônico
//   por completo — ver #ensureCanonicalMasterPromotion.
//
// Ligada: resumes.service.ts#create (Fase 2A),
// cv-adaptation.service.ts#startAuthenticatedAnalysisJob (Fase 2C/2C.1) e
// #startGuestAnalysisJob (Fase 2D) passam a criar CvSource + CvSubmission +
// CvProcessingJob (novo caminho, processado por CvProcessingWorker em ciclo
// de cron separado, nunca por Promise fire-and-forget dentro do request);
// claimGuestAnalysisJob (Fase 2E) passa a rodar o claim granular quando a
// AnalysisJob envolvida veio de um desses dois entrypoints; create()/
// claimGuest()/saveGuestPreview() (Fase 2G) e resumes.service.ts#setPrimary
// (Fase 2G) passam a integrar o pipeline canônico como descrito acima.
export function isCvStructuredProfilePipelineEnabled(): boolean {
  return process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED === "true";
}
