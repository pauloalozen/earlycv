import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SavedJobOrigin } from "@prisma/client";
import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { DatabaseService } from "../database/database.service";
import { JobApplicationsService } from "../job-applications/job-applications.service";
import { toPublicJobView } from "../jobs/public-job-view";
import { MatchingEngine } from "../radar/matching.engine";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";

@Injectable()
export class SavedJobsService {
  private readonly logger = new Logger(SavedJobsService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MatchingEngine) private readonly matchingEngine: MatchingEngine,
    @Inject(UserRadarProfileService)
    private readonly userRadarProfileService: UserRadarProfileService,
    @Inject(JobApplicationsService)
    private readonly jobApplicationsService: JobApplicationsService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
  ) {}

  // Idempotente: clicar "salvar" de novo numa vaga já salva não deve
  // quebrar nem duplicar — só devolve o registro existente. origin só é
  // gravado na criação (upsert.update fica vazio) — resalvar uma vaga não
  // reatribui a origem original. monitor_recommendation_saved só é emitido
  // quando a linha é criada de fato com origin=MONITOR — nunca em
  // re-save/no-op, e nunca para origin=RADAR (Radar não tem evento
  // canônico de "salvou vaga" e este método não introduz um).
  async save(userId: string, jobId: string, origin: SavedJobOrigin = "RADAR") {
    const existing = await this.database.savedJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });

    const saved = await this.database.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      update: {},
      create: { userId, jobId, origin },
    });

    if (!existing && origin === "MONITOR") {
      await this.funnelEvents
        .record(
          {
            eventName: "monitor_recommendation_saved",
            eventVersion: 1,
            idempotencyKey: `monitor_recommendation_saved:${saved.id}`,
            metadata: { jobId, product_origin: "monitor" },
          },
          {
            correlationId: `monitor-saved-job:${saved.id}`,
            ip: null,
            requestId: `monitor-saved-job:${saved.id}`,
            routePath: "/api/saved-jobs",
            sessionInternalId: null,
            sessionPublicToken: null,
            userAgentHash: null,
            userId,
          },
          "backend",
        )
        .catch((err: unknown) => {
          this.logger.warn(
            `[saved-jobs] failed to record monitor_recommendation_saved: ${err}`,
          );
        });
    }

    return saved;
  }

  async unsave(userId: string, jobId: string) {
    await this.database.savedJob.deleteMany({ where: { userId, jobId } });
  }

  // Enriquecido com os mesmos campos do card de /vagas (score de
  // oportunidade, existingApplication, isSaved) pra usar exatamente o mesmo
  // componente de card na tela de vagas salvas.
  async list(
    userId: string,
    page = 1,
    limit = 20,
    sort: "date_desc" | "date_asc" = "date_desc",
  ) {
    const skip = (page - 1) * limit;
    const [rows, total, radarProfile] = await Promise.all([
      this.database.savedJob.findMany({
        where: { userId },
        include: { job: { include: { company: true, enrichment: true } } },
        orderBy: { createdAt: sort === "date_asc" ? "asc" : "desc" },
        skip,
        take: limit,
      }),
      this.database.savedJob.count({ where: { userId } }),
      this.userRadarProfileService.getProfile(userId),
    ]);

    const bestScores = await this.jobApplicationsService.getBestScoresByJobIds(
      userId,
      rows.map((row) => row.jobId),
    );

    const items = rows.map((row) => {
      const enrichment = row.job.enrichment;
      const match =
        radarProfile &&
        enrichment &&
        enrichment.enrichmentStatus === "COMPLETED"
          ? this.matchingEngine.calculateScore(
              {
                jobId: row.job.id,
                workModel: row.job.workModel,
                dominantArea: enrichment.dominantArea,
                areas: enrichment.areas,
                requiredSkills: enrichment.requiredSkills,
                technologies: enrichment.technologies,
                seniority: enrichment.seniority,
                languageRequirements: enrichment.languageRequirements,
              },
              {
                areas: radarProfile.areas,
                skills: radarProfile.skills,
                technologies: radarProfile.technologies,
                seniority: radarProfile.seniority,
                languages: radarProfile.languages,
                preferredWorkModels: radarProfile.preferredWorkModels,
              },
            )
          : null;

      const existing = bestScores.get(row.job.id) ?? null;

      return {
        savedJobId: row.id,
        savedAt: row.createdAt.toISOString(),
        job: {
          ...toPublicJobView(row.job),
          score: match?.score ?? null,
          breakdown: match?.breakdown ?? null,
          matchedSkills: match?.matchedSkills ?? [],
          missingSkills: match?.missingSkills ?? [],
          breakdownDetails: match?.matchDetails ?? null,
          existingApplication: existing
            ? {
                id: existing.applicationId,
                status: existing.status,
                bestScore: existing.bestScore,
              }
            : null,
          isSaved: true,
        },
      };
    });

    return { items, total, page, limit };
  }

  // Usado pela listagem /vagas pra marcar em lote (sem N+1) quais vagas da
  // página atual o usuário já salvou — mesmo padrão de
  // JobApplicationsService.getBestScoresByJobIds.
  async listSavedJobIds(
    userId: string,
    jobIds: string[],
  ): Promise<Set<string>> {
    if (jobIds.length === 0) return new Set();

    const rows = await this.database.savedJob.findMany({
      where: { userId, jobId: { in: jobIds } },
      select: { jobId: true },
    });

    return new Set(rows.map((row) => row.jobId));
  }
}
