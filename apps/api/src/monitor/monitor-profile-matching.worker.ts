import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import {
  MatchingEngine,
  type ScorableJob,
  type ScorableProfile,
  scoreToOpportunityLevel,
} from "../radar/matching.engine";
import { MonitorEntitlementService } from "./monitor-entitlement.service";
import { computeMonitorMatchFingerprint } from "./monitor-profile-fingerprint";
import { nearbySeniorities } from "./monitor-seniority-window";

const LOCK_ID = "monitor-profile-matching-worker";
const LOCK_TTL_MS = 5 * 60_000;
const BASE_TICK_CRON = "*/15 * * * * *";
// Menor que o BATCH_SIZE do MonitorMatchingWorker (25) — cada item aqui é
// "1 perfil x até MAX_CANDIDATE_JOBS vagas + até RECONCILE_BATCH_SIZE
// recomendações existentes", trabalho bem mais pesado por item do que o
// worker inverso (1 vaga x N perfis, cada candidato é um calculateScore só).
const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;
const MIN_RECOMMENDATION_LEVEL = 3;
const SENIORITY_PREFILTER_DISTANCE = 3;

// Janela do backfill: "vagas recentes já na base" = capturadas pelo
// ingestion nos últimos 30 dias. Usa Job.firstSeenAt (nunca nulo, já
// indexado — @@index([firstSeenAt]) em schema.prisma) em vez de
// publishedAtSource (nullable, reflete a data que a fonte reportou, não
// quando entrou na nossa base) — para o propósito de backfill ("o que já
// temos ingerido que vale mostrar pra um Monitor recém-ativado"), o momento
// de captura é o campo correto.
const BACKFILL_WINDOW_DAYS = 30;

// Teto por execução — bound explícito de custo por usuário processado, não
// "1 usuário x todas as vagas históricas". Se a janela tiver mais
// candidatos que isso (perfil muito amplo, sem área definida), processamos
// os MAX_CANDIDATE_JOBS mais recentes nesta passada; o restante fica para
// uma futura melhoria de paginação multi-lote (fora do escopo desta fase —
// documentado como limitação conhecida).
const MAX_CANDIDATE_JOBS = 500;

// Teto de recomendações ATIVAS (dismissedAt null) reconciliadas por
// execução — generoso frente ao volume esperado (só entram no feed
// recomendações nível 3+, um subconjunto já filtrado).
const RECONCILE_BATCH_SIZE = 300;

@Injectable()
export class MonitorProfileMatchingWorker {
  private readonly logger = new Logger(MonitorProfileMatchingWorker.name);

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

  async processPendingBatch() {
    const owner = `monitor-profile-matching-worker-${randomUUID()}`;
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

      const pending = await this.database.monitorProfileMatchJob.findMany({
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
    const stuck = await this.database.monitorProfileMatchJob.findMany({
      where: { status: "PROCESSING" },
    });

    for (const item of stuck) {
      if (item.updatedAt >= staleThreshold) continue;

      const attempts = item.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;

      this.logger.warn(
        `monitor profile match job ${item.id} recovered from stale PROCESSING (attempt ${attempts})`,
      );

      await this.database.monitorProfileMatchJob.update({
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

  private async processJob(matchJob: {
    id: string;
    userId: string;
    attempts: number;
  }) {
    await this.database.monitorProfileMatchJob.update({
      where: { id: matchJob.id },
      data: { status: "PROCESSING" },
    });

    try {
      const matchedCount = await this.matchProfileAgainstJobs(matchJob.userId);

      await this.database.monitorProfileMatchJob.update({
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
        `monitor profile match job ${matchJob.id} (user ${matchJob.userId}) failed (attempt ${attempts}): ${message}`,
      );

      await this.database.monitorProfileMatchJob.update({
        where: { id: matchJob.id },
        data: {
          attempts,
          lastError: message,
          status: failed ? "FAILED" : "PENDING",
        },
      });
    }
  }

  // Núcleo de "perfil (re)configurado -> recomendações": reconcilia o que
  // já existe (pode ter deixado de ser aderente, ou voltado a ser) e
  // descobre vagas novas dentro da janela que ainda não têm recomendação
  // pra este usuário. Ao final, só marca o perfil como "versão processada"
  // (matchFingerprint/lastMatchedAt) se ele não mudou (em campos relevantes
  // ao matching) durante a execução — caso contrário devolve PENDING pro
  // job, pra reprocessar com a versão mais nova (nunca deixa um resultado
  // calculado com perfil desatualizado "vencer").
  private async matchProfileAgainstJobs(userId: string): Promise<number> {
    const { allowed } = await this.entitlementService.canUseMonitor(userId);
    if (!allowed) {
      return 0;
    }

    const profile = await this.database.userRadarProfile.findUnique({
      where: { userId },
    });

    if (!profile || profile.areas.length === 0) {
      return 0;
    }

    const startFingerprint = computeMonitorMatchFingerprint(profile);
    const scorableProfile: ScorableProfile = {
      areas: profile.areas,
      skills: profile.skills,
      technologies: profile.technologies,
      seniority: profile.seniority,
      languages: profile.languages,
      preferredWorkModels: profile.preferredWorkModels,
    };

    const reconciledCount = await this.reconcileExistingRecommendations(
      userId,
      scorableProfile,
    );
    const discoveredCount = await this.discoverNewRecommendations(
      userId,
      profile.areas,
      profile.seniority,
      scorableProfile,
    );

    const profileAfter = await this.database.userRadarProfile.findUnique({
      where: { userId },
    });

    if (profileAfter) {
      const endFingerprint = computeMonitorMatchFingerprint(profileAfter);

      if (endFingerprint === startFingerprint) {
        await this.database.userRadarProfile.update({
          where: { userId },
          data: {
            matchFingerprint: endFingerprint,
            lastMatchedAt: new Date(),
            monitorStatus: "ACTIVE",
          },
        });
      } else {
        // Perfil mudou (em campo relevante ao matching) durante esta
        // execução — não marca como processado. processJob ainda grava
        // COMPLETED nesta chamada (matchedCount reflete o que foi feito
        // agora), mas o próximo enqueueRematch (ou a leitura de
        // lastMatchedAt continuando desatualizada) garante reprocessamento;
        // ver MonitorProfileMatchService.enqueueRematch.
        this.logger.log(
          `monitor profile for user ${userId} changed mid-run — matchFingerprint not advanced, will reprocess on next trigger`,
        );
      }
    }

    return reconciledCount + discoveredCount;
  }

  // Recomendações ATIVAS (dismissedAt null — inclui as já supersededAt,
  // que podem voltar a ficar válidas) recalculadas contra o perfil atual.
  // Nunca toca dismissedAt; nunca reativa uma recomendação dismissed.
  private async reconcileExistingRecommendations(
    userId: string,
    scorableProfile: ScorableProfile,
  ): Promise<number> {
    const existing = await this.database.userJobRecommendation.findMany({
      where: { userId, dismissedAt: null },
      include: { job: { include: { enrichment: true } } },
      orderBy: [{ recommendedAt: "desc" }],
      take: RECONCILE_BATCH_SIZE,
    });

    let reconciledCount = 0;

    for (const recommendation of existing) {
      const job = recommendation.job;
      const enrichment = job.enrichment;

      const isLive =
        job.status === "active" && enrichment?.enrichmentStatus === "COMPLETED";
      const match =
        isLive && enrichment
          ? this.matchingEngine.calculateScore(
              this.toScorableJob(job, enrichment),
              scorableProfile,
            )
          : null;
      const opportunityLevel = match ? scoreToOpportunityLevel(match.score) : 0;

      if (match && opportunityLevel >= MIN_RECOMMENDATION_LEVEL) {
        await this.database.userJobRecommendation.update({
          where: { id: recommendation.id },
          data: {
            score: match.score,
            opportunityLevel,
            // Perfil voltou a ser compatível — reabre, sem tocar viewedAt
            // (não é uma vaga "nova", é a mesma recomendação retomando
            // validade).
            supersededAt: null,
          },
        });
      } else if (recommendation.supersededAt === null) {
        await this.database.userJobRecommendation.update({
          where: { id: recommendation.id },
          data: { supersededAt: new Date() },
        });
      }

      reconciledCount += 1;
    }

    return reconciledCount;
  }

  private toScorableJob(
    job: { id: string; workModel: string | null },
    enrichment: {
      dominantArea: ScorableJob["dominantArea"];
      areas: ScorableJob["areas"];
      requiredSkills: string[];
      technologies: string[];
      seniority: ScorableJob["seniority"];
      languageRequirements: string[];
    },
  ): ScorableJob {
    return {
      jobId: job.id,
      workModel: job.workModel,
      dominantArea: enrichment.dominantArea,
      areas: enrichment.areas,
      requiredSkills: enrichment.requiredSkills,
      technologies: enrichment.technologies,
      seniority: enrichment.seniority,
      languageRequirements: enrichment.languageRequirements,
    };
  }

  // Descoberta: vagas ATIVAS, com enrichment COMPLETED, dentro da janela de
  // 30 dias (Job.firstSeenAt), que passam no pré-filtro de área/senioridade
  // e que este usuário AINDA NÃO TEM recomendação (relation filter
  // `recommendations: { none: { userId } }` sobre o unique [userId,jobId] —
  // mesmo papel que o índice único cumpre para MonitorMatchingWorker: nunca
  // recalcula quem já tem linha, seja ela ativa ou superseded).
  private async discoverNewRecommendations(
    userId: string,
    profileAreas: ScorableProfile["areas"],
    profileSeniority: ScorableProfile["seniority"],
    scorableProfile: ScorableProfile,
  ): Promise<number> {
    const windowStart = new Date(
      Date.now() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const seniorityFilter =
      profileSeniority && profileSeniority !== "UNKNOWN"
        ? {
            seniority: {
              in: nearbySeniorities(
                profileSeniority,
                SENIORITY_PREFILTER_DISTANCE,
              ),
            },
          }
        : {};

    const candidateJobs = await this.database.job.findMany({
      where: {
        status: "active",
        firstSeenAt: { gte: windowStart },
        enrichment: {
          enrichmentStatus: "COMPLETED",
          dominantArea: { not: "OTHER" },
          ...(profileAreas.length > 0
            ? { areas: { hasSome: profileAreas } }
            : {}),
          ...seniorityFilter,
        },
        recommendations: { none: { userId } },
      },
      include: { enrichment: true },
      orderBy: [{ firstSeenAt: "desc" }],
      take: MAX_CANDIDATE_JOBS,
    });

    let createdCount = 0;

    for (const job of candidateJobs) {
      if (!job.enrichment) continue;

      const scorableJob = this.toScorableJob(job, job.enrichment);
      const match = this.matchingEngine.calculateScore(
        scorableJob,
        scorableProfile,
      );
      const opportunityLevel = scoreToOpportunityLevel(match.score);

      if (opportunityLevel < MIN_RECOMMENDATION_LEVEL) {
        continue;
      }

      // upsert (não create): protege contra a corrida "mesma vaga entra por
      // backfill/rematch E por MonitorMatchingWorker (vaga nova) ao mesmo
      // tempo" — a query já exclui jobId com recomendação existente, mas
      // entre o SELECT e este INSERT o outro worker pode ter criado a
      // linha; upsert sobre o unique [userId,jobId] mantém idempotência.
      await this.database.userJobRecommendation.upsert({
        where: { userId_jobId: { userId, jobId: job.id } },
        create: {
          userId,
          jobId: job.id,
          score: match.score,
          opportunityLevel,
        },
        update: {
          score: match.score,
          opportunityLevel,
        },
      });

      createdCount += 1;
    }

    return createdCount;
  }
}
