import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { JobApplicationsService } from "../job-applications/job-applications.service";
import { toPublicJobView } from "../jobs/public-job-view";
import { SavedJobsService } from "../saved-jobs/saved-jobs.service";

const DEFAULT_GROUP_LIMIT = 10;
const MAX_GROUP_LIMIT = 30;
const PENDING_LIMIT_DEFAULT = 50;
const MAX_PENDING_LIMIT = 200;

type RecommendationWithJob = Prisma.UserJobRecommendationGetPayload<{
  include: { job: { include: { company: true } } };
}>;

// Leitura específica pro histórico de notificações ("Alerta de Vaga
// Certa" na UI) — NÃO reaproveita MonitorRecommendationsService.list(),
// que continua servindo meu-perfil e GET /monitor/count sem alteração.
// Paginação aqui é sobre MonitorDigest (um grupo = um envio), não sobre
// recomendação individual.
//
// Decisão de produto importante: esta tela é um registro histórico
// ("isso é o que te enviamos"), então NUNCA recalcula score/match contra
// o perfil atual (usa row.score/row.opportunityLevel congelados) e NUNCA
// filtra vaga já analisada/salva/descartada — mostra o estado via badge
// no card em vez de esconder, senão a contagem do grupo deixa de bater
// com o que foi realmente enviado por e-mail.
@Injectable()
export class MonitorNotificationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(JobApplicationsService)
    private readonly jobApplicationsService: JobApplicationsService,
    @Inject(SavedJobsService)
    private readonly savedJobsService: SavedJobsService,
  ) {}

  async listNotifications(
    userId: string,
    options: { page?: number; limit?: number; pendingLimit?: number },
  ) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(
      MAX_GROUP_LIMIT,
      Math.max(1, options.limit ?? DEFAULT_GROUP_LIMIT),
    );
    const pendingLimit = Math.min(
      MAX_PENDING_LIMIT,
      Math.max(1, options.pendingLimit ?? PENDING_LIMIT_DEFAULT),
    );
    const skip = (page - 1) * limit;

    const monitorStatus = await this.getMonitorStatus(userId);

    const sentWhere = {
      userId,
      status: "SENT",
      sentAt: { not: null },
    } satisfies Prisma.MonitorDigestWhereInput;

    const [digests, totalGroups] = await Promise.all([
      this.database.monitorDigest.findMany({
        where: sentWhere,
        orderBy: { sentAt: "desc" },
        skip,
        take: limit,
        include: {
          recommendations: {
            include: {
              recommendation: { include: { job: { include: { company: true } } } },
            },
            orderBy: [
              { recommendation: { recommendedAt: "desc" } },
              { recommendation: { opportunityLevel: "desc" } },
            ],
          },
        },
      }),
      this.database.monitorDigest.count({ where: sentWhere }),
    ]);

    // Página 1 também busca o bucket "novas vagas encontradas" — nunca
    // recarregado em páginas seguintes de grupos (o "loadMore" da lista
    // de grupos não deve re-substituir o pending já mostrado).
    const pendingWhere = {
      userId,
      dismissedAt: null,
      supersededAt: null,
      digestInclusions: { none: { digest: { status: "SENT" } } },
    } satisfies Prisma.UserJobRecommendationWhereInput;

    const [pendingRows, pendingTotal]: [RecommendationWithJob[] | null, number | null] =
      page === 1
        ? await Promise.all([
            this.database.userJobRecommendation.findMany({
              where: pendingWhere,
              include: { job: { include: { company: true } } },
              orderBy: [
                { recommendedAt: "desc" },
                { opportunityLevel: "desc" },
              ],
              take: pendingLimit,
            }),
            this.database.userJobRecommendation.count({
              where: pendingWhere,
            }),
          ])
        : [null, null];

    // bestScores/savedJobIds resolvidos numa única leva pra união de
    // todos os jobIds (grupos + pending) — mesmo padrão de
    // MonitorRecommendationsService.list().
    const allJobIds = [
      ...digests.flatMap((digest) =>
        digest.recommendations.map((entry) => entry.recommendation.jobId),
      ),
      ...(pendingRows ?? []).map((row) => row.jobId),
    ];

    const [bestScores, savedJobIds] = await Promise.all([
      this.jobApplicationsService.getBestScoresByJobIds(userId, allJobIds),
      this.savedJobsService.listSavedJobIds(userId, allJobIds),
    ]);

    const groups = digests.map((digest) => {
      const items = digest.recommendations.map((entry) =>
        this.toNotificationItem(entry.recommendation, bestScores, savedJobIds),
      );
      return {
        digestId: digest.id,
        sentAt: (digest.sentAt as Date).toISOString(),
        frequency: digest.frequency,
        items,
        total: items.length,
      };
    });

    const pending =
      pendingRows === null
        ? null
        : {
            items: pendingRows.map((row) =>
              this.toNotificationItem(row, bestScores, savedJobIds),
            ),
            total: pendingTotal ?? 0,
            hasMore: (pendingTotal ?? 0) > pendingRows.length,
          };

    const hasMore = skip + limit < totalGroups;

    return {
      pending,
      groups,
      page,
      limit,
      totalGroups,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      monitorStatus,
    };
  }

  private toNotificationItem(
    row: RecommendationWithJob,
    bestScores: Awaited<
      ReturnType<JobApplicationsService["getBestScoresByJobIds"]>
    >,
    savedJobIds: Set<string>,
  ) {
    const existing = bestScores.get(row.jobId) ?? null;

    return {
      recommendationId: row.id,
      score: row.score,
      opportunityLevel: row.opportunityLevel,
      recommendedAt: row.recommendedAt.toISOString(),
      viewedAt: row.viewedAt?.toISOString() ?? null,
      dismissedAt: row.dismissedAt?.toISOString() ?? null,
      isNew: row.viewedAt === null,
      feedback: row.feedback,
      feedbackReason: row.feedbackReason,
      job: {
        ...toPublicJobView({ ...row.job, enrichment: null }),
        isSaved: savedJobIds.has(row.jobId),
        existingApplication: existing
          ? {
              id: existing.applicationId,
              status: existing.status,
              bestScore: existing.bestScore,
            }
          : null,
      },
    };
  }

  // Espelha MonitorRecommendationsService.getMonitorStatus — duplicado
  // deliberadamente (é um único findUnique trivial) em vez de expor o
  // método privado do outro service, pra manter os dois services
  // independentes.
  private async getMonitorStatus(userId: string): Promise<string> {
    const profile = await this.database.userRadarProfile.findUnique({
      where: { userId },
      select: { monitorStatus: true },
    });
    return profile?.monitorStatus ?? "INITIALIZING";
  }
}
