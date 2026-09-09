// Fábrica compartilhada de serviços/instâncias reais usadas pelos testes
// permanentes do pipeline canônico de CV (2ª rodada de auditoria,
// 2026-09-08). Diferença deliberada em relação a todo e2e-spec anterior
// desta feature: usa CvProcessingFlagResolverService REAL (nunca o
// fallback @Optional() que ignora admin/allowlist) e intercepta o payload
// no nível de rede do client de IA (chat.completions.create), nunca numa
// camada de proteção mockada.
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { ClaimSourceGrantService } from "../../cv-processing/claim-source-grant.service";
import { CvMasterPromotionService } from "../../cv-processing/cv-master-promotion.service";
import { CvProcessingWorker } from "../../cv-processing/cv-processing.worker";
import { CvProcessingEntrypointService } from "../../cv-processing/cv-processing-entrypoint.service";
import { CvProcessingFlagResolverService } from "../../cv-processing/cv-processing-flag-resolver.service";
import { CvProcessingJobService } from "../../cv-processing/cv-processing-job.service";
import { CvTalentCaptureService } from "../../cv-processing/cv-talent-capture.service";
import { CvUserProfileSyncService } from "../../cv-processing/cv-user-profile-sync.service";
import { DatabaseService } from "../../database/database.service";
import { IngestionLockRepository } from "../../ingestion/ingestion-lock.repository";
import type { MasterCvCanonicalExtractionOutput } from "../../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import { ProfileCanonicalMergeService } from "../../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../../profiles/profile-readiness.service";
import { TalentSubjectService } from "../../talent-subjects/talent-subject.service";
import { CvAdaptationAiService } from "../cv-adaptation-ai.service";
import { CvAdaptationProtectedAnalyzeService } from "../cv-adaptation-protected-analyze.service";
import { CvAdaptationService } from "../cv-adaptation.service";
import { CvAnalysisWorker } from "../cv-analysis.worker";

export const CvAdaptationServiceCtor = CvAdaptationService as unknown as new (
  ...args: unknown[]
) => CvAdaptationService;

export const prisma = new PrismaClient();
export const database = new DatabaseService(prisma);
export const jobService = new CvProcessingJobService(database);
export const talentCapture = new CvTalentCaptureService(database);
export const userProfileSync = new CvUserProfileSyncService(
  new ProfileCanonicalMergeService(),
  new ProfileReadinessService(),
);
export const masterPromotion = new CvMasterPromotionService(
  database,
  userProfileSync,
);
export const lockRepository = new IngestionLockRepository(database);
export const talentSubjectService = new TalentSubjectService(database);
export const claimSourceGrantService = new ClaimSourceGrantService(
  database,
  masterPromotion,
);
// Instância REAL — nunca o fallback @Optional() (achado da 1ª rodada de
// auditoria: todo e2e-spec anterior omitia isto, testando um caminho que
// nunca teria bloqueado guest/usuário fora da allowlist).
export const flagResolver = new CvProcessingFlagResolverService(database);

export const JOB_DESCRIPTION_BASE =
  "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.";

export function buildCvText(name: string, marker: string): string {
  return [
    name,
    "Resumo",
    `Profissional com experiência em ${marker}, formação superior concluída em 2020 e boas habilidades de comunicação.`,
    "Experiência",
    `2020 - 2023 | Analista - ${marker}`,
  ].join("\n");
}

export class FakeStorage {
  private readonly objects = new Map<string, Buffer>();
  async putObject(key: string, body: Buffer): Promise<string> {
    this.objects.set(key, body);
    return `fake://${key}`;
  }
  async getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) {
      const error = new Error(`NoSuchKey: ${key}`) as Error & { name: string };
      error.name = "NoSuchKey";
      throw error;
    }
    return object;
  }
  async deleteObject(): Promise<void> {
    return;
  }
}

export function fakeCanonicalOutput(
  marker: string,
): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName: marker,
      headline: marker,
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: marker,
      experiences: [],
      education: [],
      skills: [marker],
      languages: [],
      certifications: [],
    },
    extractionCoverage: {
      identifiedFields: [],
      missingFields: [],
      fieldStatus: {},
    },
    confidence: {},
    evidence: {},
  };
}

export function buildProcessingWorker(
  extract: () => Promise<MasterCvCanonicalExtractionOutput>,
  storage: FakeStorage,
): CvProcessingWorker {
  return new CvProcessingWorker(
    database,
    lockRepository,
    jobService,
    { extract },
    talentCapture,
    masterPromotion,
    storage,
  );
}

export function buildAnalysisWorker(
  cvAdaptationService: CvAdaptationService,
): CvAnalysisWorker {
  return new CvAnalysisWorker(
    database,
    lockRepository,
    userProfileSync,
    cvAdaptationService,
  );
}

export async function processOneCvJob(worker: CvProcessingWorker, jobId: string) {
  const claimed = await jobService.claimOne(jobId, `test-${randomUUID()}`);
  if (!claimed) throw new Error(`cv processing job ${jobId} deveria estar PENDING`);
  await (
    worker as unknown as { processJob: (job: typeof claimed) => Promise<void> }
  ).processJob(claimed);
  return database.cvProcessingJob.findUniqueOrThrow({ where: { id: jobId } });
}

export async function processOneAnalysisJob(
  worker: CvAnalysisWorker,
  jobId: string,
) {
  const job = await database.analysisJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { cvProcessingJob: true },
  });
  if (!job.cvProcessingJob) {
    throw new Error("AnalysisJob sem cvProcessingJob associado");
  }
  const claimed = await (
    worker as unknown as { claim: (id: string) => Promise<typeof job | null> }
  ).claim(jobId);
  if (!claimed) throw new Error(`analysis job ${jobId} deveria estar pending`);
  await (
    worker as unknown as {
      processReadyJob: (
        job: NonNullable<typeof claimed>,
        cvProcessingJob: { cvStructuredProfileId: string | null },
      ) => Promise<void>;
    }
  ).processReadyJob(claimed, {
    cvStructuredProfileId: job.cvProcessingJob.cvStructuredProfileId,
  });
  return database.analysisJob.findUniqueOrThrow({ where: { id: jobId } });
}

export function buildCapturingAiClient(
  validAnalysisJson: () => string,
  validGenerationJson: () => string,
) {
  const capturedMessages: Array<Array<{ role: string; content: string }>> = [];
  const client = {
    chat: {
      completions: {
        create: async (params: {
          messages: Array<{ role: string; content: string }>;
        }) => {
          capturedMessages.push(params.messages);
          const isAnalysis = params.messages.some((m) =>
            m.content.includes("<MODO_ANALISE>"),
          );
          return {
            choices: [
              {
                message: {
                  content: isAnalysis
                    ? validAnalysisJson()
                    : validGenerationJson(),
                },
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        },
      },
    },
  };
  return { client, capturedMessages };
}

export function minimalAnalysisJson(): string {
  return JSON.stringify({
    vaga: { cargo: "Analista", empresa: "Acme" },
    requirements: [
      {
        requirementText: "req",
        importance: "medium",
        coverageStatus: "partial",
        evidence: [],
        gapExplanation: "",
        recommendation: "",
        impactScore: 5,
      },
    ],
    fit: {
      score: 50,
      score_pos_ajustes: 50,
      categoria: "medio",
      headline: "ok",
      subheadline: "ok",
    },
    secoes: {
      experiencia: { score: 20, max: 40 },
      competencias: { score: 20, max: 40 },
      formatacao: { score: 10, max: 20 },
    },
    positivos: [],
    ajustes_conteudo: [],
    keywords: { presentes: [], possiveis: [], ausentes: [] },
    formato_cv: { ats_score: 50, resumo: "ok", problemas: [], campos: [] },
    comparacao: { antes: "antes", depois: "depois" },
    preview: { antes: "antes", depois: "depois" },
    pontos_fortes: [],
    lacunas: [],
    melhorias_aplicadas: [],
    ats_keywords: { presentes: [], ausentes: [] },
    projecao_melhoria: {
      score_atual: 50,
      score_pos_otimizacao: 50,
      explicacao_curta: "ok",
    },
    mensagem_venda: { titulo: "ok", subtexto: "ok" },
  });
}

export function minimalGenerationJson(): string {
  return JSON.stringify({
    summary: "ok",
    sections: [
      {
        sectionType: "experience",
        title: "Exp",
        items: [{ heading: "H", bullets: ["b"] }],
      },
    ],
    highlightedSkills: [],
    removedSections: [],
    adaptationNotes: "ok",
  });
}

export function buildRealCvAdaptationService(
  analysisClient: unknown,
  generationClient: unknown,
  entrypoint: Pick<
    CvProcessingEntrypointService,
    "enqueueFromUserText" | "enqueueFromGuestText"
  >,
  storage?: FakeStorage,
): CvAdaptationService {
  const aiService = new CvAdaptationAiService(
    database,
    analysisClient as never,
    generationClient as never,
  );
  // Passthrough mínimo de AnalysisProtectionFacade — turnstile/rate-limit/
  // dedupe são ortogonais à escolha de fonte do CV, que é o que estes
  // testes verificam. Nunca mocka CvAdaptationProtectedAnalyzeService nem
  // CvAdaptationAiService em si.
  const fakeFacade = {
    executeProtectedAnalysis: async (
      _opts: unknown,
      _context: unknown,
      compute: () => Promise<unknown>,
    ) => ({
      ok: true as const,
      cached: false,
      canonicalHash: randomUUID(),
      result: await compute(),
    }),
    precheckTurnstile: async () => ({ ok: true as const }),
  };
  const protectedAnalyzeService = new CvAdaptationProtectedAnalyzeService(
    fakeFacade as never,
    aiService,
  );
  return new CvAdaptationServiceCtor(
    database,
    aiService,
    undefined,
    undefined,
    undefined,
    protectedAnalyzeService,
    storage,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    entrypoint,
    masterPromotion,
    talentSubjectService,
    claimSourceGrantService,
    flagResolver,
  );
}

export function buildEntrypoint(storage: FakeStorage): CvProcessingEntrypointService {
  return new CvProcessingEntrypointService(database, jobService, storage);
}

export function allMessageContent(
  messages: Array<{ role: string; content: string }>,
): string {
  return messages.map((m) => m.content).join("\n---\n");
}
