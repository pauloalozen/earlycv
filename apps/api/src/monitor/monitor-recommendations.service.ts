import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type {
  Prisma,
  RecommendationFeedback,
  RecommendationFeedbackReason,
} from "@prisma/client";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { DatabaseService } from "../database/database.service";
import { JobApplicationsService } from "../job-applications/job-applications.service";
import { toPublicJobView } from "../jobs/public-job-view";
import { MatchingEngine } from "../radar/matching.engine";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";
import { SavedJobsService } from "../saved-jobs/saved-jobs.service";
import { MonitorEntitlementService } from "./monitor-entitlement.service";
import { MonitorProfileMatchService } from "./monitor-profile-match.service";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

// Meu Monitor NÃO é uma variante do Radar: GET /monitor consulta
// prioritariamente UserJobRecommendation (feed já persistido pelo
// MonitorMatchingWorker), nunca a listagem geral de vagas filtrada pelo
// perfil (isso é o Radar — ver ADENDO DE PRODUTO da spec). Ausência de
// resultados é um estado válido, não um erro.
@Injectable()
export class MonitorRecommendationsService {
  private readonly logger = new Logger(MonitorRecommendationsService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(JobApplicationsService)
    private readonly jobApplicationsService: JobApplicationsService,
    @Inject(SavedJobsService)
    private readonly savedJobsService: SavedJobsService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
    @Inject(MonitorProfileMatchService)
    private readonly monitorProfileMatchService: MonitorProfileMatchService,
    @Inject(MatchingEngine) private readonly matchingEngine: MatchingEngine,
    @Inject(UserRadarProfileService)
    private readonly userRadarProfileService: UserRadarProfileService,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  async list(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      includeDismissed?: boolean;
      // Filtra por nível de oportunidade (0-5) — usado pela paginação por
      // seção da UI (cada seção do Monitor pagina só os itens do seu
      // próprio nível, ver MonitorLevelSection no frontend).
      opportunityLevel?: number;
      // "score" (default) preserva a ordem histórica (novas primeiro, depois
      // relevância); "recent" ordena só por recomendedAt desc — usado pelo
      // toggle "Mais recentes" da UI. Só afeta a ordem DENTRO do filtro
      // aplicado (ex.: dentro de um opportunityLevel específico).
      sort?: "score" | "recent";
      // Mesmo filtro "excluir analisadas" do Radar (ver PublicJobsController)
      // — desligado por padrão aqui, ao contrário do Radar.
      excludeAnalyzed?: boolean;
    },
  ) {
    // "Entrar no Monitor" — dispara o backfill inicial se este usuário
    // ainda não teve nenhum matching completo. Barato quando já foi
    // processado (um SELECT, sem escrita); ver MonitorProfileMatchService.
    await this.monitorProfileMatchService.ensureMonitorInitialized(userId);

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(
      MAX_PAGE_LIMIT,
      Math.max(1, options.limit ?? DEFAULT_PAGE_LIMIT),
    );
    const skip = (page - 1) * limit;
    // includeDismissed=true também traz recomendações supersededAt (que
    // deixaram de atender ao perfil atual) — sem parâmetro extra nesta
    // fase: ambas são "inativas no feed padrão", diferenciáveis pelos
    // próprios campos (dismissedAt vs supersededAt) para quem pedir a
    // listagem completa.
    const includeDismissed = options.includeDismissed ?? false;

    const where = {
      userId,
      ...(includeDismissed ? {} : { dismissedAt: null, supersededAt: null }),
      ...(options.opportunityLevel !== undefined
        ? { opportunityLevel: options.opportunityLevel }
        : {}),
    };

    const orderBy =
      options.sort === "recent"
        ? [{ recommendedAt: "desc" as const }]
        : // Novas primeiro (viewedAt nulo antes de qualquer data), depois por
          // relevância (opportunityLevel desc) e por fim as mais recentes.
          [
            { viewedAt: { sort: "asc" as const, nulls: "first" as const } },
            { opportunityLevel: "desc" as const },
            { recommendedAt: "desc" as const },
          ];

    const monitorStatus = await this.getMonitorStatus(userId);

    const include = {
      job: { include: { company: true, enrichment: true } },
    } satisfies Prisma.UserJobRecommendationInclude;

    let rows: Array<
      Prisma.UserJobRecommendationGetPayload<{ include: typeof include }>
    >;
    let total: number;

    if (options.excludeAnalyzed) {
      // excludeAnalyzed precisa decidir quem entra na paginação antes de
      // fatiar (mesmo motivo do Radar, ver PublicJobsController) — busca
      // todo o conjunto que bate no filtro, resolve bestScores pra ele
      // inteiro, filtra e só então pagina. Só entra nesse caminho mais
      // caro quando o usuário liga o toggle explicitamente; o fluxo
      // padrão (abaixo) continua paginando direto no banco.
      const allRows = await this.database.userJobRecommendation.findMany({
        where,
        include,
        orderBy,
      });
      const allBestScores = await this.jobApplicationsService.getBestScoresByJobIds(
        userId,
        allRows.map((row) => row.jobId),
      );
      const filteredRows = allRows.filter(
        (row) => typeof allBestScores.get(row.jobId)?.bestScore !== "number",
      );
      total = filteredRows.length;
      rows = filteredRows.slice(skip, skip + limit);
    } else {
      [rows, total] = await Promise.all([
        this.database.userJobRecommendation.findMany({
          where,
          include,
          orderBy,
          skip,
          take: limit,
        }),
        this.database.userJobRecommendation.count({ where }),
      ]);
    }

    const jobIds = rows.map((row) => row.jobId);
    const [savedJobIds, bestScores, radarProfile] = await Promise.all([
      this.savedJobsService.listSavedJobIds(userId, jobIds),
      this.jobApplicationsService.getBestScoresByJobIds(userId, jobIds),
      this.userRadarProfileService.getProfile(userId),
    ]);

    // breakdown/matchedSkills/missingSkills não são persistidos em
    // UserJobRecommendation (só score/opportunityLevel — o que decidiu a
    // entrada no feed) — recalculados aqui contra o perfil atual, mesmo
    // padrão já usado por SavedJobsService.list() pro card poder mostrar
    // "por que essa vaga bateu" (ScoreBreakdownPanel).
    const items = rows.map((row) => {
      const existing = bestScores.get(row.jobId) ?? null;
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
          ...toPublicJobView(row.job),
          score: row.score,
          breakdown: match?.breakdown ?? null,
          breakdownDetails: match?.matchDetails ?? null,
          matchedSkills: match?.matchedSkills ?? [],
          missingSkills: match?.missingSkills ?? [],
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
    });

    return { items, total, page, limit, monitorStatus };
  }

  // Barato de propósito (só COUNT sobre índice userId+viewedAt/dismissedAt)
  // — pensado para badge global, chamado com frequência bem maior que
  // GET /monitor.
  async countUnviewed(
    userId: string,
  ): Promise<{ count: number; monitorStatus: string }> {
    await this.monitorProfileMatchService.ensureMonitorInitialized(userId);

    const [count, monitorStatus] = await Promise.all([
      this.database.userJobRecommendation.count({
        where: {
          userId,
          viewedAt: null,
          dismissedAt: null,
          supersededAt: null,
        },
      }),
      this.getMonitorStatus(userId),
    ]);

    return { count, monitorStatus };
  }

  // Conta recomendações ativas por nível de oportunidade (0-5) — usado pela
  // UI pra saber quais seções renderizar e o total de cada uma antes de
  // buscar os itens em si (ver MonitorLevelSection). Níveis sem nenhuma
  // recomendação vêm com 0, nunca omitidos do resultado.
  async countByLevel(userId: string): Promise<Record<number, number>> {
    await this.monitorProfileMatchService.ensureMonitorInitialized(userId);

    const rows = await this.database.userJobRecommendation.groupBy({
      by: ["opportunityLevel"],
      where: { userId, dismissedAt: null, supersededAt: null },
      _count: { _all: true },
    });

    const counts: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const row of rows) {
      counts[row.opportunityLevel] = row._count._all;
    }
    return counts;
  }

  // "nenhuma vaga encontrada" (ACTIVE + feed vazio) vs "ainda estamos
  // preparando seu Monitor" (INITIALIZING/REFRESHING) — só existe porque a
  // spec da Fase 1.5 pede explicitamente essa distinção para o frontend;
  // não é estado por estética. Sem UserRadarProfile ainda (usuário nunca
  // subiu CV master), trata como INITIALIZING — não há Monitor configurado
  // pra chamar de ACTIVE.
  private async getMonitorStatus(userId: string): Promise<string> {
    const profile = await this.database.userRadarProfile.findUnique({
      where: { userId },
      select: { monitorStatus: true },
    });
    return profile?.monitorStatus ?? "INITIALIZING";
  }

  async markViewed(userId: string, recommendationId: string) {
    const recommendation = await this.getOwnedRecommendation(
      userId,
      recommendationId,
    );

    // Idempotente: repetir a chamada numa recomendação já vista só devolve
    // o estado atual, sem tocar viewedAt de novo.
    const updated =
      recommendation.viewedAt !== null
        ? recommendation
        : await this.database.userJobRecommendation.update({
            where: { id: recommendationId },
            data: { viewedAt: new Date() },
          });

    await this.recordEvent(
      "monitor_recommendation_viewed",
      userId,
      recommendation,
      {},
      `monitor_recommendation_viewed:${recommendationId}`,
    );

    return updated;
  }

  async dismiss(userId: string, recommendationId: string) {
    const recommendation = await this.getOwnedRecommendation(
      userId,
      recommendationId,
    );

    const updated =
      recommendation.dismissedAt !== null
        ? recommendation
        : await this.database.userJobRecommendation.update({
            where: { id: recommendationId },
            data: { dismissedAt: new Date() },
          });

    await this.recordEvent(
      "monitor_recommendation_dismissed",
      userId,
      recommendation,
      {},
      `monitor_recommendation_dismissed:${recommendationId}`,
    );

    return updated;
  }

  async submitFeedback(
    userId: string,
    recommendationId: string,
    feedback: RecommendationFeedback,
    feedbackReason?: RecommendationFeedbackReason,
  ) {
    const recommendation = await this.getOwnedRecommendation(
      userId,
      recommendationId,
    );

    const updated = await this.database.userJobRecommendation.update({
      where: { id: recommendationId },
      data: {
        feedback,
        feedbackReason: feedbackReason ?? null,
        feedbackAt: new Date(),
      },
    });

    // Coletado nesta fase apenas para análise — não realimenta o algoritmo
    // de matching automaticamente (spec explícita da Fase 1).
    await this.recordEvent(
      "monitor_recommendation_feedback",
      userId,
      recommendation,
      { feedback, feedback_reason: feedbackReason ?? null },
      `monitor_recommendation_feedback:${recommendationId}:${feedback}:${feedbackReason ?? "none"}`,
    );

    return updated;
  }

  // Nunca confia num userId vindo do corpo/query — sempre cruza com o
  // AuthenticatedUser da rota. Retorna 404 (nunca 403) para não revelar se
  // o id pertence a outro usuário.
  private async getOwnedRecommendation(
    userId: string,
    recommendationId: string,
  ) {
    const recommendation = await this.database.userJobRecommendation.findFirst({
      where: { id: recommendationId, userId },
    });

    if (!recommendation) {
      throw new NotFoundException("recommendation not found");
    }

    return recommendation;
  }

  private buildBackendContext(userId: string, key: string) {
    return {
      correlationId: `monitor:${key}`,
      ip: null,
      requestId: `monitor:${key}`,
      routePath: "/api/monitor",
      sessionInternalId: null,
      sessionPublicToken: null,
      userAgentHash: null,
      userId,
    };
  }

  private async recordEvent(
    eventName: string,
    userId: string,
    recommendation: {
      id: string;
      jobId: string;
      score: number;
      opportunityLevel: number;
    },
    metadata: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    const context = this.buildBackendContext(userId, recommendation.id);
    // monitor_access_type: baixa cardinalidade (5 valores fixos de
    // MonitorEntitlementReason), anexada pra permitir comparar
    // gratuito/trial/assinante/promocional mais tarde sem precisar
    // reprocessar histórico — ver MonitorEntitlementService.
    const { reason: accessType } =
      await this.entitlementService.canUseMonitor(userId);
    await this.funnelEvents
      .record(
        {
          eventName,
          eventVersion: 1,
          idempotencyKey,
          metadata: {
            ...metadata,
            jobId: recommendation.jobId,
            score: recommendation.score,
            opportunityLevel: recommendation.opportunityLevel,
            product_origin: "monitor",
            monitor_access_type: accessType,
          },
        },
        context,
        "backend",
      )
      .catch((err: unknown) => {
        this.logger.warn(`[monitor] failed to record ${eventName}: ${err}`);
      });
  }
}
