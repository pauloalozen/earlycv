// Erros de domínio do pipeline de perfil canônico de CV (Fase 2). Plano,
// docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, seção 7/10.
//
// MasterDesignationSubjectMismatchError: a trigger
// trg_master_designation_subject_match em CvMasterDesignation é
// DEFERRABLE INITIALLY DEFERRED — só dispara no COMMIT da transação, nunca
// no INSERT/UPDATE em si. Isso significa que o Prisma $transaction()
// propaga a violação como exceção do próprio COMMIT (não da instrução que
// fez o INSERT), então esse erro só pode ser observado DEPOIS que
// promote()/promoteAndProject() já tentou retornar — nunca dá pra "ler de
// volta" o resultado antes disso pra confirmar sucesso. Todo chamador do
// worker/serviço de promoção deve tratar essa exceção especificamente (não
// deixar vazar PrismaClientKnownRequestError/PrismaClientUnknownRequestError
// crus) e, para retry, simplesmente chamar promoteAndProject() de novo — o
// método sempre reavalia o estado ativo do banco do zero (SELECT dentro do
// advisory lock), nunca reenvia o mesmo INSERT.
export class MasterDesignationSubjectMismatchError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MasterDesignationSubjectMismatchError";
  }
}

// Marcador textual usado pela função da trigger (migration de Fase 1,
// check_master_designation_subject_match) — usado só para reconhecer a
// violação vinda do Postgres em qualquer forma que o Prisma a envelope.
export const SUBJECT_MISMATCH_MARKERS = [
  "CvMasterDesignation subject mismatch",
] as const;

export function isSubjectMismatchError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return SUBJECT_MISMATCH_MARKERS.some((marker) => message.includes(marker));
}

// CvSourceTextObjectMissingError: o worker leu CvSource.textStorageKey e o
// objeto correspondente não existe (ou não existe mais) no storage real
// (Fase 2B — plano, seção 6/12). Tratado explicitamente como falha de
// domínio recuperável do CvProcessingJob (markFailed com esta mensagem em
// lastError), nunca como erro genérico — permite retry (ex.: problema
// transitório do bucket) ou intervenção manual (objeto realmente perdido)
// sem mascarar a causa raiz atrás de uma exceção crua do SDK do S3.
export class CvSourceTextObjectMissingError extends Error {
  constructor(readonly storageKey: string) {
    super(
      `CvSource.textStorageKey aponta para um objeto ausente no storage (key=${storageKey}). ` +
        "Pode ser perda real de dado (objeto nunca gravado ou removido por retenção) ou falha " +
        "transitória do storage — o job fica em PENDING/FAILED conforme attempts, permitindo " +
        "retry ou intervenção manual sem reprocessar a extração de IA.",
    );
    this.name = "CvSourceTextObjectMissingError";
  }
}

// NoValidMasterCvForProfileAnalysisError: Fase 2C.1 (fecha a lacuna deixada
// pela 2C) — análise autenticada com inputMode "profile" (ou, de modo
// geral, qualquer chamada sem conteúdo novo de CV) precisa de um Master
// formal para reusar/materializar. "Formal" aqui significa: uma
// CvMasterDesignation ativa (supersededAt IS NULL), OU, na ausência dela,
// um Resume.isMaster=true com rawText não vazio (Master "legado", ainda
// não materializado no pipeline novo — Fase 2C.1 cria o CvProcessingJob
// just-in-time para ele). Nenhum desses dois existindo, o método lança
// este erro em vez de reconstruir um CV a partir de UserProfile — mesmo
// que UserProfile tenha dados projetados de um Master antigo já apagado
// (a projeção nunca é tratada como origem/fonte canônica, plano seção 1/6).
// Erro de domínio puro (sem dependência de @nestjs/common), seguindo o
// padrão já usado neste arquivo — o chamador HTTP (cv-adaptation.service.ts)
// mapeia para BadRequestException no boundary.
// CvStructuredProfileLineageMismatchError: violação da trigger
// check_analysis_job_succeeded_requires_ready_profile (migration
// 20260908211500) — o perfil referenciado não é o produzido pelo próprio
// CvProcessingJob da análise, não está READY, ou o dono não bate (nem via
// ClaimSourceGrant). Mesmo padrão DEFERRABLE INITIALLY DEFERRED de
// MasterDesignationSubjectMismatchError: só é observável no COMMIT.
export class CvStructuredProfileLineageMismatchError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CvStructuredProfileLineageMismatchError";
  }
}

const LINEAGE_MISMATCH_MARKERS = [
  "linhagem quebrada",
  "não corresponde ao CvStructuredProfile produzido pelo seu CvProcessingJob",
  "não é dono do CvSource",
  "não corresponde ao TalentSubject dono do CvSource",
  "referencia um CvProcessingJob inexistente",
  "diverge do AnalysisJob",
] as const;

export function isLineageMismatchError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return LINEAGE_MISMATCH_MARKERS.some((marker) => message.includes(marker));
}

// CvStructuredProfileImmutableError: violação da trigger
// reject_ready_profile_mutation (migration 20260908210000) — uma vez
// READY, nem os campos canônicos nem o status em si podem mudar.
export class CvStructuredProfileImmutableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CvStructuredProfileImmutableError";
  }
}

export function isProfileImmutableError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message.includes("immutable once READY");
}

export class NoValidMasterCvForProfileAnalysisError extends Error {
  constructor(readonly userId: string) {
    super(
      "Nenhum CV Master válido encontrado para analisar por perfil: não há " +
        "CvMasterDesignation ativa nem Resume marcado como master com texto " +
        "para este usuário. Envie um novo CV (arquivo ou texto) para " +
        "prosseguir — o perfil salvo (UserProfile) nunca é usado como CV " +
        "reconstruível, mesmo que contenha dados de um Master antigo já " +
        "removido.",
    );
    this.name = "NoValidMasterCvForProfileAnalysisError";
  }
}
