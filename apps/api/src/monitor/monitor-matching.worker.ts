import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SeniorityLevel } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import {
  MatchingEngine,
  type ScorableJob,
  type ScorableProfile,
  scoreToOpportunityLevel,
} from "../radar/matching.engine";
import { MonitorEntitlementService } from "./monitor-entitlement.service";
import { nearbySeniorities } from "./monitor-seniority-window";

const LOCK_ID = "monitor-matching-worker";
const LOCK_TTL_MS = 5 * 60_000;
const BASE_TICK_CRON = "*/15 * * * * *";
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 3;

// processJob marca PROCESSING antes de rodar o matching. Se o processo
// morrer no meio (deploy, restart) o registro fica preso em PROCESSING —
// mesmo raciocínio/limiar de JobEnrichmentWorker.recoverStaleProcessing.
const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;

// Só entram no feed persistido do Meu Monitor recomendações nível 3+
// ("Aderente" pra cima, ver scoreToOpportunityLevel) — níveis 0-2 continuam
// acessíveis pelo Radar, mas não são gravados em UserJobRecommendation.
const MIN_RECOMMENDATION_LEVEL = 3;

// Distância máxima de senioridade no PRÉ-FILTRO (não é o critério final de
// pontuação — isso é MatchingEngine.calculateScore, chamado em memória só
// para quem passar aqui). Folga maior que a usada dentro de calculateScore
// para não descartar no pré-filtro um candidato que ainda pontuaria alto o
// suficiente pela força de outras dimensões (área/skills).
const SENIORITY_PREFILTER_DISTANCE = 3;

@Injectable()
export class MonitorMatchingWorker {
  private readonly logger = new Logger(MonitorMatchingWorker.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(MatchingEngine) private readonly matchingEngine: MatchingEngine,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  @Cron(BASE_TICK_CRON)
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    await this.processPendingBatch();
  }

  // Extraído do tick() pra ser testável sem depender do guard de NODE_ENV do
  // decorator @Cron — mesmo padrão de JobEnrichmentWorker.runScheduledCycle.
  async processPendingBatch() {
    const owner = `monitor-matching-worker-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );

    if (!acquired) {
      return 0;
    }

    try {
      await this.recoverStaleProcessing();

      const pending = await this.database.monitorMatchJob.findMany({
        where: { status: "PENDING" },
        orderBy: [{ createdAt: "asc" }],
        take: BATCH_SIZE,
      });

      for (const matchJob of pending) {
        await this.processJob(matchJob);
      }

      return pending.length;
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async recoverStaleProcessing() {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
    const stuck = await this.database.monitorMatchJob.findMany({
      where: { status: "PROCESSING" },
    });

    for (const item of stuck) {
      if (item.updatedAt >= staleThreshold) continue;

      const attempts = item.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;

      this.logger.warn(
        `monitor match job ${item.id} recovered from stale PROCESSING (attempt ${attempts})`,
      );

      await this.database.monitorMatchJob.update({
        where: { id: item.id },
        data: {
          attempts,
          lastError:
            "stale PROCESSING recuperado pelo worker (processo provavelmente reiniciado durante o matching)",
          status: failed ? "FAILED" : "PENDING",
        },
      });
    }
  }

  // Uma vaga por vez — falha de UMA vaga (ex: erro transitório de banco) não
  // pode travar as demais do lote nem propagar pro chamador (o enrichment já
  // terminou com sucesso antes desta fila existir; ver job-enrichment.worker.ts).
  private async processJob(matchJob: {
    id: string;
    jobId: string;
    attempts: number;
  }) {
    await this.database.monitorMatchJob.update({
      where: { id: matchJob.id },
      data: { status: "PROCESSING" },
    });

    try {
      const matchedCount = await this.matchJobAgainstProfiles(matchJob.jobId);

      await this.database.monitorMatchJob.update({
        where: { id: matchJob.id },
        data: {
          status: "COMPLETED",
          matchedCount,
          processedAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const attempts = matchJob.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message : "unknown error";

      this.logger.warn(
        `monitor match job ${matchJob.id} (job ${matchJob.jobId}) failed (attempt ${attempts}): ${message}`,
      );

      await this.database.monitorMatchJob.update({
        where: { id: matchJob.id },
        data: {
          attempts,
          lastError: message,
          status: failed ? "FAILED" : "PENDING",
        },
      });
    }
  }

  // Núcleo do fluxo "vaga nova -> descobrir usuários compatíveis":
  // 1) pré-filtro barato via índice (area GIN + seniority btree) em
  //    UserRadarProfile — nunca varre a tabela inteira;
  // 2) MatchingEngine.calculateScore em memória só para quem passou no
  //    pré-filtro;
  // 3) persiste UserJobRecommendation apenas para nível >= 3, preservando
  //    viewedAt/dismissedAt/feedback de quem já tinha essa recomendação.
  private async matchJobAgainstProfiles(jobId: string): Promise<number> {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
      include: { enrichment: true },
    });

    if (!job?.enrichment || job.enrichment.enrichmentStatus !== "COMPLETED") {
      // Vaga sem enrichment completo (removida, reprocessada, falhou depois
      // de enfileirar) — nada a fazer, não é erro.
      return 0;
    }
    if (job.status !== "active") {
      return 0;
    }

    const enrichment = job.enrichment;
    const scorableJob: ScorableJob = {
      jobId: job.id,
      workModel: job.workModel,
      dominantArea: enrichment.dominantArea,
      areas: enrichment.areas,
      requiredSkills: enrichment.requiredSkills,
      technologies: enrichment.technologies,
      seniority: enrichment.seniority,
      languageRequirements: enrichment.languageRequirements,
    };

    // Área vazia (enrichment sem classificação suficiente) não filtra por
    // área — não há como decidir compatibilidade a partir de nada; mesmo
    // raciocínio de MatchingEngine.filterCompatibleJobs (que faz o inverso:
    // filtra vagas por perfil).
    const candidateAreas = enrichment.dominantArea
      ? [
          enrichment.dominantArea,
          ...enrichment.areas.filter((a) => a !== enrichment.dominantArea),
        ]
      : enrichment.areas;

    const seniorityFilter =
      enrichment.seniority && enrichment.seniority !== SeniorityLevel.UNKNOWN
        ? {
            seniority: {
              in: nearbySeniorities(
                enrichment.seniority,
                SENIORITY_PREFILTER_DISTANCE,
              ),
            },
          }
        : {};

    const candidates = await this.database.userRadarProfile.findMany({
      where: {
        ...(candidateAreas.length > 0
          ? { areas: { hasSome: candidateAreas } }
          : {}),
        ...seniorityFilter,
      },
    });

    // Filtra por entitlement em lote — quem perdeu acesso ao Monitor não
    // recebe NOVAS recomendações, mas isso nunca apaga o que já existe
    // (ver MonitorEntitlementService). Feito depois do pré-filtro de
    // área/senioridade (mais barato) pra não gastar a checagem de
    // entitlement em candidatos que já seriam descartados de qualquer
    // forma.
    const entitledUserIds = await this.entitlementService.filterEntitledUserIds(
      candidates.map((profile) => profile.userId),
    );

    let matchedCount = 0;

    for (const profile of candidates) {
      if (!entitledUserIds.has(profile.userId)) {
        continue;
      }
      const scorableProfile: ScorableProfile = {
        areas: profile.areas,
        skills: profile.skills,
        technologies: profile.technologies,
        seniority: profile.seniority,
        languages: profile.languages,
        preferredWorkModels: profile.preferredWorkModels,
      };

      const match = this.matchingEngine.calculateScore(
        scorableJob,
        scorableProfile,
      );
      const opportunityLevel = scoreToOpportunityLevel(match.score);

      if (opportunityLevel < MIN_RECOMMENDATION_LEVEL) {
        continue;
      }

      await this.database.userJobRecommendation.upsert({
        where: { userId_jobId: { userId: profile.userId, jobId: job.id } },
        create: {
          userId: profile.userId,
          jobId: job.id,
          score: match.score,
          opportunityLevel,
        },
        // viewedAt/dismissedAt/feedback nunca são tocados num update — só
        // score/opportunityLevel podem mudar (ex: reprocessamento manual do
        // enrichment). recommendedAt também fica intacto: recomputar não é
        // uma "nova" recomendação para efeito de ordenação/badge.
        update: {
          score: match.score,
          opportunityLevel,
        },
      });

      matchedCount += 1;
    }

    return matchedCount;
  }
}
