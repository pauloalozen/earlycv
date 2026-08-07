import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { JobApplicationsService } from "../job-applications/job-applications.service";
import { toPublicJobView } from "../jobs/public-job-view";
import { MatchingEngine } from "../radar/matching.engine";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";

@Injectable()
export class SavedJobsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MatchingEngine) private readonly matchingEngine: MatchingEngine,
    @Inject(UserRadarProfileService)
    private readonly userRadarProfileService: UserRadarProfileService,
    @Inject(JobApplicationsService)
    private readonly jobApplicationsService: JobApplicationsService,
  ) {}

  // Idempotente: clicar "salvar" de novo numa vaga já salva não deve
  // quebrar nem duplicar — só devolve o registro existente.
  async save(userId: string, jobId: string) {
    return this.database.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      update: {},
      create: { userId, jobId },
    });
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
