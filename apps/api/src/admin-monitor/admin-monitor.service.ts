import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { MonitorMatchJobStatus, Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { MonitorAlertPreferenceService } from "../monitor/monitor-alert-preference.service";
import { MonitorDigestContentService } from "../monitor/monitor-digest-content.service";
import {
  DEFAULT_INTRO_TEXT,
  DEFAULT_SUBJECT_TEMPLATE,
  MonitorDigestEmailService,
} from "../monitor/monitor-digest-email.service";
import {
  startOfIsoWeekUtc,
  startOfUtcDay,
} from "../monitor/monitor-digest-schedule.util";
import { MonitorEntitlementService } from "../monitor/monitor-entitlement.service";
import { MonitorProfileMatchService } from "../monitor/monitor-profile-match.service";
import {
  MatchingEngine,
  type ScorableJob,
  type ScorableProfile,
  scoreToOpportunityLevel,
} from "../radar/matching.engine";
import type { AdminMonitorRecommendationStatusFilter } from "./dto/list-admin-monitor-recommendations.dto";
import type { DigestHistorySourceFilter } from "./dto/list-digest-history.dto";
import type { UpdateDigestContentDto } from "./dto/update-digest-content.dto";
import type { UpdateDigestScheduleDto } from "./dto/update-digest-schedule.dto";

const DEFAULT_SCHEDULE_CONFIG = {
  dailyHour: 11,
  dailyMinute: 0,
  weeklyDayOfWeek: 1,
  timezone: "America/Sao_Paulo",
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Mesmos limiares usados pelos workers reais (ver STALE_PROCESSING_THRESHOLD_MS
// em monitor-matching.worker.ts / monitor-profile-matching.worker.ts /
// monitor-digest.worker.ts) — a seção de Falhas usa isto pra decidir o que é
// "travado" de fato, não um número inventado pro admin.
const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;

// UserRadarProfile não tem um "worker dedicado com recoverStaleProcessing"
// (INITIALIZING/REFRESHING são apenas o status enquanto um
// MonitorProfileMatchJob correspondente está PENDING/PROCESSING) — usamos um
// limiar mais generoso, só para sinalizar no admin um caso que já deveria ter
// resolvido sozinho (perfil sem job ativo, mas ainda não ACTIVE).
const STALE_MONITOR_STATUS_THRESHOLD_MS = 30 * 60_000;

const MONITOR_MATCH_JOB_STATUSES: MonitorMatchJobStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
];

const MONITOR_DIGEST_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "SKIPPED",
] as const;

const MONITOR_DIGEST_EVENT_TYPES = [
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "BOUNCED",
  "COMPLAINED",
] as const;

// Eventos do funil relevantes para reconstruir a jornada do Monitor de um
// usuário (§10) — timeline por correlação de userId + ordem temporal, NUNCA
// uma atribuição garantida de clique único. Ver getUserAttribution.
const ATTRIBUTION_EVENT_NAMES = [
  "monitor_digest_sent",
  "monitor_digest_delivered",
  "monitor_digest_opened",
  "monitor_digest_clicked",
  "monitor_view",
  "monitor_recommendation_viewed",
  "monitor_recommendation_dismissed",
  "monitor_recommendation_feedback",
  "monitor_application_started",
  "payment_approved",
];

function paginate(page?: number, limit?: number) {
  const safePage = page && page > 0 ? Math.floor(page) : 1;
  const safeLimit =
    limit && limit > 0 ? Math.min(Math.floor(limit), MAX_LIMIT) : DEFAULT_LIMIT;
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

function countsByKey<K extends string, G extends { _count: { _all: number } }>(
  keys: readonly K[],
  groups: G[],
  keyOf: (group: G) => K,
): Record<K, number> {
  const result = Object.fromEntries(keys.map((k) => [k, 0])) as Record<
    K,
    number
  >;
  for (const group of groups) {
    result[keyOf(group)] = group._count._all;
  }
  return result;
}

// Recommendation com os campos mínimos que a UI de diagnóstico precisa —
// nunca o objeto Prisma cru inteiro (evita vazar campos internos por acaso).
const recommendationSelect = {
  id: true,
  userId: true,
  jobId: true,
  score: true,
  opportunityLevel: true,
  recommendedAt: true,
  viewedAt: true,
  dismissedAt: true,
  supersededAt: true,
  feedback: true,
  feedbackReason: true,
  feedbackAt: true,
  createdAt: true,
  job: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      company: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserJobRecommendationSelect;

function recommendationStatusWhere(
  status: AdminMonitorRecommendationStatusFilter | undefined,
): Prisma.UserJobRecommendationWhereInput {
  switch (status) {
    case "active":
      return { dismissedAt: null, supersededAt: null };
    case "new":
      return { dismissedAt: null, supersededAt: null, viewedAt: null };
    case "viewed":
      return { viewedAt: { not: null } };
    case "dismissed":
      return { dismissedAt: { not: null } };
    case "superseded":
      return { supersededAt: { not: null } };
    case "with-application":
      // JobApplication não tem FK direta para UserJobRecommendation — a
      // correlação disponível é userId + jobId (mesmo par identifica "essa
      // vaga, pra esse usuário", ver getUserRecommendationsWithContext).
      return {};
    default:
      return {};
  }
}

@Injectable()
export class AdminMonitorService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MatchingEngine) private readonly matchingEngine: MatchingEngine,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
    @Inject(MonitorProfileMatchService)
    private readonly profileMatchService: MonitorProfileMatchService,
    @Inject(MonitorAlertPreferenceService)
    private readonly alertPreferenceService: MonitorAlertPreferenceService,
    @Inject(MonitorDigestContentService)
    private readonly digestContentService: MonitorDigestContentService,
    @Inject(MonitorDigestEmailService)
    private readonly digestEmailService: MonitorDigestEmailService,
  ) {}

  // ---------------------------------------------------------------------
  // §2 Visão geral
  // ---------------------------------------------------------------------
  // Escopo de matching (perfil/recomendação/filas) só — tudo que é sobre o
  // e-mail do digest (contagem por status, 24h de entrega/abertura/clique,
  // digests FAILED) mudou pra getDigestEmailStats(), que alimenta
  // /admin/alerta-vagas em vez desta tela (ver decisão do Paulo: as duas
  // telas mostravam o mesmo MonitorDigest, gerando sobreposição/confusão —
  // Monitor fica só com matching, Alerta de Vagas fica com tudo de e-mail).
  async getOverview() {
    const [
      profileStatusGroups,
      recommendationsActive,
      recommendationsNew,
      recommendationsSuperseded,
      recommendationsDismissed,
      matchJobGroups,
      profileMatchJobGroups,
      configuredProfiles,
    ] = await Promise.all([
      this.database.userRadarProfile.groupBy({
        by: ["monitorStatus"],
        _count: { _all: true },
        where: { areas: { isEmpty: false } },
      }),
      this.database.userJobRecommendation.count({
        where: { dismissedAt: null, supersededAt: null },
      }),
      this.database.userJobRecommendation.count({
        where: { dismissedAt: null, supersededAt: null, viewedAt: null },
      }),
      this.database.userJobRecommendation.count({
        where: { supersededAt: { not: null } },
      }),
      this.database.userJobRecommendation.count({
        where: { dismissedAt: { not: null } },
      }),
      this.database.monitorMatchJob.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.database.monitorProfileMatchJob.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.database.userRadarProfile.findMany({
        where: { areas: { isEmpty: false } },
        select: { userId: true },
      }),
    ]);

    const byMonitorStatus = countsByKey(
      ["INITIALIZING", "ACTIVE", "REFRESHING"] as const,
      profileStatusGroups,
      (g) => g.monitorStatus,
    );

    // Entitlement escopado a quem já configurou o Monitor (tem
    // UserRadarProfile com áreas) — contar TODOS os Users da base incluiria
    // gente que nunca abriu o Monitor, o que não é "usuários com entitlement
    // ativo" no sentido operacional que esta tela quer responder.
    const entitledIds = await this.entitlementService.filterEntitledUserIds(
      configuredProfiles.map((p) => p.userId),
    );

    return {
      usersWithMonitorConfigured: configuredProfiles.length,
      usersInitializing: byMonitorStatus.INITIALIZING,
      usersActive: byMonitorStatus.ACTIVE,
      usersRefreshing: byMonitorStatus.REFRESHING,
      usersWithEntitlement: entitledIds.size,
      recommendations: {
        active: recommendationsActive,
        new: recommendationsNew,
        superseded: recommendationsSuperseded,
        dismissed: recommendationsDismissed,
      },
      matchJobs: countsByKey(
        MONITOR_MATCH_JOB_STATUSES,
        matchJobGroups,
        (g) => g.status,
      ),
      profileMatchJobs: countsByKey(
        MONITOR_MATCH_JOB_STATUSES,
        profileMatchJobGroups,
        (g) => g.status,
      ),
    };
  }

  // ---------------------------------------------------------------------
  // Estatísticas de e-mail do digest — usado por /admin/alerta-vagas, não
  // pelo Monitor (ver comentário em getOverview). Junta o que antes estava
  // espalhado entre getOverview (contagem por status, 24h) e getFailures
  // (digests FAILED, processamento travado).
  // ---------------------------------------------------------------------
  async getDigestEmailStats() {
    const since24h = new Date(Date.now() - 24 * 60 * 60_000);
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);

    const [
      digestGroups,
      sentLast24h,
      eventGroupsLast24h,
      stuckProcessing,
      failedDigests,
    ] = await Promise.all([
      this.database.monitorDigest.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.database.monitorDigest.count({
        where: { status: "SENT", sentAt: { gte: since24h } },
      }),
      this.database.monitorDigestEvent.groupBy({
        by: ["type"],
        _count: { _all: true },
        where: { occurredAt: { gte: since24h } },
      }),
      this.database.monitorDigest.count({
        where: { status: "PROCESSING", updatedAt: { lt: staleThreshold } },
      }),
      this.database.monitorDigest.findMany({
        where: { status: "FAILED" },
        orderBy: [{ updatedAt: "desc" }],
        take: 100,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
    ]);

    return {
      byStatus: countsByKey(
        MONITOR_DIGEST_STATUSES,
        digestGroups,
        (g) => g.status,
      ),
      sentLast24h,
      eventsLast24h: countsByKey(
        MONITOR_DIGEST_EVENT_TYPES,
        eventGroupsLast24h,
        (g) => g.type,
      ),
      stuckProcessing,
      staleProcessingThresholdMs: STALE_PROCESSING_THRESHOLD_MS,
      failedDigests,
    };
  }

  // ---------------------------------------------------------------------
  // §3 Busca por usuário
  // ---------------------------------------------------------------------
  async searchUsers(params: { page?: number; limit?: number; query?: string }) {
    const { page, limit, skip } = paginate(params.page, params.limit);
    const query = params.query?.trim();

    const where: Prisma.UserWhereInput = query
      ? {
          OR: [
            { id: query },
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.database.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          radarProfile: {
            select: { monitorStatus: true, lastMatchedAt: true },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.database.user.count({ where }),
    ]);

    return { page, limit, total, users };
  }

  // ---------------------------------------------------------------------
  // §4 Diagnóstico do usuário — identificação + entitlement + estado do
  // Monitor + perfil usado para matching.
  // ---------------------------------------------------------------------
  async getUserDiagnostic(userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) {
      throw new NotFoundException("user not found");
    }

    const [entitlement, profile, alertPreference, profileMatchJob] =
      await Promise.all([
        // Nunca reimplementa a regra — só chama o service real e devolve o
        // resultado tal como veio.
        this.entitlementService.canUseMonitor(userId),
        this.database.userRadarProfile.findUnique({ where: { userId } }),
        this.database.monitorAlertPreference.findUnique({ where: { userId } }),
        this.database.monitorProfileMatchJob.findUnique({ where: { userId } }),
      ]);

    return {
      user,
      entitlement,
      monitor: profile
        ? {
            monitorStatus: profile.monitorStatus,
            lastMatchedAt: profile.lastMatchedAt,
            matchFingerprint: profile.matchFingerprint,
            generatedAt: profile.generatedAt,
            updatedAt: profile.updatedAt,
            sourceResumeId: profile.sourceResumeId,
          }
        : null,
      // Campos separados em dois grupos deliberadamente (§4): os primeiros 6
      // são exatamente os consumidos por computeMonitorMatchFingerprint (ver
      // monitor-profile-fingerprint.ts) — mudá-los dispara rematch. O resto é
      // apenas informativo (não influencia o matching hoje).
      profile: profile
        ? {
            fingerprint: {
              areas: profile.areas,
              seniority: profile.seniority,
              skills: profile.skills,
              technologies: profile.technologies,
              languages: profile.languages,
              preferredWorkModels: profile.preferredWorkModels,
            },
            informational: {
              certifications: profile.certifications,
              preferredContractTypes: profile.preferredContractTypes,
              openToRelocation: profile.openToRelocation,
              salaryExpectationMin: profile.salaryExpectationMin,
              careerFingerprint: profile.careerFingerprint,
            },
          }
        : null,
      profileMatchJob,
      alertPreference,
    };
  }

  // ---------------------------------------------------------------------
  // §5 Histórico de processamento — profile matching jobs (matching por
  // vaga nova documentado como limitação, ver comentário no controller).
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // §6 Recomendações do usuário (paginado, com filtros)
  // ---------------------------------------------------------------------
  async listUserRecommendations(
    userId: string,
    params: {
      page?: number;
      limit?: number;
      status?: AdminMonitorRecommendationStatusFilter;
      opportunityLevel?: number;
    },
  ) {
    const { page, limit, skip } = paginate(params.page, params.limit);

    const where: Prisma.UserJobRecommendationWhereInput = {
      userId,
      ...recommendationStatusWhere(params.status),
      ...(params.opportunityLevel !== undefined
        ? { opportunityLevel: params.opportunityLevel }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.database.userJobRecommendation.findMany({
        where,
        select: recommendationSelect,
        orderBy: [{ recommendedAt: "desc" }],
        skip,
        take: limit,
      }),
      this.database.userJobRecommendation.count({ where }),
    ]);

    // SavedJob/JobApplication não têm FK para UserJobRecommendation — a
    // única correlação disponível e correta é o par (userId, jobId), que é
    // exatamente o que garante unicidade de UserJobRecommendation
    // (@@unique([userId, jobId])) — nunca ambíguo.
    const jobIds = rows.map((r) => r.jobId);
    const [savedJobs, applications] = await Promise.all([
      jobIds.length
        ? this.database.savedJob.findMany({
            where: { userId, jobId: { in: jobIds } },
            select: { jobId: true },
          })
        : [],
      jobIds.length
        ? this.database.jobApplication.findMany({
            where: { userId, jobId: { in: jobIds } },
            select: { jobId: true, status: true },
          })
        : [],
    ]);
    const savedJobIds = new Set(savedJobs.map((s) => s.jobId));
    const applicationByJobId = new Map(
      applications
        .filter((a): a is typeof a & { jobId: string } => a.jobId !== null)
        .map((a) => [a.jobId, a.status]),
    );

    return {
      page,
      limit,
      total,
      items: rows.map((r) => ({
        ...r,
        isSaved: savedJobIds.has(r.jobId),
        applicationStatus: applicationByJobId.get(r.jobId) ?? null,
      })),
    };
  }

  // ---------------------------------------------------------------------
  // §9 Digest / e-mail — histórico para um usuário
  // ---------------------------------------------------------------------
  async listUserDigests(
    userId: string,
    params: { page?: number; limit?: number },
  ) {
    const { page, limit, skip } = paginate(params.page, params.limit);

    const [digests, total] = await Promise.all([
      this.database.monitorDigest.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          recommendations: {
            select: {
              recommendationId: true,
              recommendation: {
                select: {
                  id: true,
                  job: {
                    select: {
                      title: true,
                      company: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
          events: { orderBy: [{ occurredAt: "asc" }] },
        },
      }),
      this.database.monitorDigest.count({ where: { userId } }),
    ]);

    return { page, limit, total, digests };
  }

  // ---------------------------------------------------------------------
  // §10 Atribuição — timeline por correlação de userId + tempo, nunca uma
  // garantia de clique único.
  // ---------------------------------------------------------------------
  async getUserAttribution(userId: string) {
    const events = await this.database.businessFunnelEvent.findMany({
      where: { userId, eventName: { in: ATTRIBUTION_EVENT_NAMES } },
      select: { eventName: true, createdAt: true, metadataJson: true },
      orderBy: [{ createdAt: "asc" }],
      take: 200,
    });

    return {
      events,
      caveat:
        "Timeline ordenada por userId + timestamp — correlação, não prova de atribuição de clique único. " +
        "Abertura de e-mail (monitor_digest_opened) é sempre indicativa, nunca 'leitura confirmada'.",
    };
  }

  // ---------------------------------------------------------------------
  // §7 Explicação do matching — score persistido x recalculado, NUNCA
  // misturados.
  // ---------------------------------------------------------------------
  async getRecommendationDetail(recommendationId: string) {
    const recommendation = await this.database.userJobRecommendation.findUnique(
      {
        where: { id: recommendationId },
        include: {
          job: { include: { company: true, enrichment: true } },
          user: { select: { id: true, email: true, name: true } },
        },
      },
    );
    if (!recommendation) {
      throw new NotFoundException("recommendation not found");
    }

    const profile = await this.database.userRadarProfile.findUnique({
      where: { userId: recommendation.userId },
    });

    const persisted = {
      score: recommendation.score,
      opportunityLevel: recommendation.opportunityLevel,
      recommendedAt: recommendation.recommendedAt,
      // O breakdown por dimensão NUNCA foi persistido em
      // UserJobRecommendation — só score/opportunityLevel finais. Não dá
      // pra reconstruir o breakdown histórico exato sem ambiguidade.
      breakdownAvailable: false as const,
    };

    let recalculated: {
      score: number;
      opportunityLevel: number;
      breakdown: unknown;
      matchedSkills: string[];
      missingSkills: string[];
      matchDetails: unknown;
    } | null = null;
    let recalculationSkippedReason: string | null = null;

    if (!profile || profile.areas.length === 0) {
      recalculationSkippedReason = "user_has_no_radar_profile";
    } else if (!recommendation.job.enrichment) {
      recalculationSkippedReason = "job_has_no_enrichment";
    } else {
      const scorableJob: ScorableJob = {
        jobId: recommendation.job.id,
        workModel: recommendation.job.workModel,
        dominantArea: recommendation.job.enrichment.dominantArea,
        areas: recommendation.job.enrichment.areas,
        requiredSkills: recommendation.job.enrichment.requiredSkills,
        technologies: recommendation.job.enrichment.technologies,
        seniority: recommendation.job.enrichment.seniority,
        languageRequirements:
          recommendation.job.enrichment.languageRequirements,
      };
      const scorableProfile: ScorableProfile = {
        areas: profile.areas,
        skills: profile.skills,
        technologies: profile.technologies,
        seniority: profile.seniority,
        languages: profile.languages,
        preferredWorkModels: profile.preferredWorkModels,
      };
      const result = this.matchingEngine.calculateScore(
        scorableJob,
        scorableProfile,
      );
      recalculated = {
        score: result.score,
        opportunityLevel: scoreToOpportunityLevel(result.score),
        breakdown: result.breakdown,
        matchedSkills: result.matchedSkills,
        missingSkills: result.missingSkills,
        matchDetails: result.matchDetails,
      };
    }

    return {
      recommendation: {
        id: recommendation.id,
        userId: recommendation.userId,
        user: recommendation.user,
        jobId: recommendation.jobId,
        job: {
          id: recommendation.job.id,
          title: recommendation.job.title,
          slug: recommendation.job.slug,
          company: recommendation.job.company.name,
        },
        viewedAt: recommendation.viewedAt,
        dismissedAt: recommendation.dismissedAt,
        supersededAt: recommendation.supersededAt,
        feedback: recommendation.feedback,
        feedbackReason: recommendation.feedbackReason,
      },
      // "Score no momento da recomendação" — nunca recalculado, nunca
      // rotulado como atual.
      scoreAtRecommendationTime: persisted,
      // "Score atual recalculado" — só existe se pudermos rodar
      // calculateScore agora; nunca substitui/mistura com o persistido.
      currentRecalculatedScore: recalculated,
      recalculationSkippedReason,
    };
  }

  // ---------------------------------------------------------------------
  // §8 Busca por vaga + diagnóstico
  // ---------------------------------------------------------------------
  async searchJobs(params: { page?: number; limit?: number; query?: string }) {
    const { page, limit, skip } = paginate(params.page, params.limit);
    const query = params.query?.trim();

    const where: Prisma.JobWhereInput = query
      ? {
          OR: [
            { id: query },
            { slug: query },
            { title: { contains: query, mode: "insensitive" } },
            { company: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {};

    const [jobs, total] = await Promise.all([
      this.database.job.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          firstSeenAt: true,
          company: { select: { name: true } },
          enrichment: {
            select: { enrichmentStatus: true, dominantArea: true },
          },
        },
        orderBy: [{ firstSeenAt: "desc" }],
        skip,
        take: limit,
      }),
      this.database.job.count({ where }),
    ]);

    return { page, limit, total, jobs };
  }

  async getJobDiagnostic(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
      include: { company: true, enrichment: true },
    });
    if (!job) {
      throw new NotFoundException("job not found");
    }

    const [
      matchJob,
      levelGroups,
      viewedCount,
      dismissedCount,
      savedCount,
      applicationCount,
    ] = await Promise.all([
      this.database.monitorMatchJob.findUnique({ where: { jobId } }),
      this.database.userJobRecommendation.groupBy({
        by: ["opportunityLevel"],
        _count: { _all: true },
        where: { jobId },
      }),
      this.database.userJobRecommendation.count({
        where: { jobId, viewedAt: { not: null } },
      }),
      this.database.userJobRecommendation.count({
        where: { jobId, dismissedAt: { not: null } },
      }),
      this.database.savedJob.count({ where: { jobId } }),
      this.database.jobApplication.count({ where: { jobId } }),
    ]);

    const recommendationCount = levelGroups.reduce(
      (sum, g) => sum + g._count._all,
      0,
    );
    const byLevel = countsByKey(
      ["0", "1", "2", "3", "4", "5"] as const,
      levelGroups,
      (g) => String(g.opportunityLevel) as "0" | "1" | "2" | "3" | "4" | "5",
    );

    return {
      job: {
        id: job.id,
        title: job.title,
        slug: job.slug,
        status: job.status,
        firstSeenAt: job.firstSeenAt,
        publishedAtSource: job.publishedAtSource,
        company: { id: job.company.id, name: job.company.name },
      },
      enrichment: job.enrichment,
      matchJob,
      recommendationStats: {
        total: recommendationCount,
        byOpportunityLevel: byLevel,
        level3Plus: byLevel["3"] + byLevel["4"] + byLevel["5"],
        viewed: viewedCount,
        dismissed: dismissedCount,
        saved: savedCount,
        applicationsStarted: applicationCount,
      },
    };
  }

  // ---------------------------------------------------------------------
  // §11 Falhas operacionais
  // ---------------------------------------------------------------------
  async getFailures() {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
    const staleMonitorThreshold = new Date(
      Date.now() - STALE_MONITOR_STATUS_THRESHOLD_MS,
    );

    const [
      failedMatchJobs,
      failedProfileMatchJobs,
      stuckMatchJobsProcessing,
      stuckProfileMatchJobsProcessing,
      stuckProfiles,
    ] = await Promise.all([
      this.database.monitorMatchJob.findMany({
        where: { status: "FAILED" },
        orderBy: [{ updatedAt: "desc" }],
        take: 100,
        include: { job: { select: { id: true, title: true } } },
      }),
      this.database.monitorProfileMatchJob.findMany({
        where: { status: "FAILED" },
        orderBy: [{ updatedAt: "desc" }],
        take: 100,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      this.database.monitorMatchJob.count({
        where: { status: "PROCESSING", updatedAt: { lt: staleThreshold } },
      }),
      this.database.monitorProfileMatchJob.count({
        where: { status: "PROCESSING", updatedAt: { lt: staleThreshold } },
      }),
      this.database.userRadarProfile.findMany({
        where: {
          monitorStatus: { in: ["INITIALIZING", "REFRESHING"] },
          updatedAt: { lt: staleMonitorThreshold },
        },
        select: {
          userId: true,
          monitorStatus: true,
          updatedAt: true,
          user: { select: { email: true, name: true } },
        },
        take: 100,
      }),
    ]);

    return {
      failedMatchJobs,
      failedProfileMatchJobs,
      // Contagens, não listas — "preso além do limite" é sinal de vida do
      // worker (deveria ter sido recuperado por recoverStaleProcessing no
      // próximo tick), então o número já é o alerta; investigar linha a
      // linha é raro o suficiente para não precisar de paginação aqui.
      stuckProcessingCounts: {
        matchJobs: stuckMatchJobsProcessing,
        profileMatchJobs: stuckProfileMatchJobsProcessing,
      },
      staleProcessingThresholdMs: STALE_PROCESSING_THRESHOLD_MS,
      stuckProfiles,
      staleMonitorStatusThresholdMs: STALE_MONITOR_STATUS_THRESHOLD_MS,
    };
  }

  // ---------------------------------------------------------------------
  // §12/§13 Ações administrativas — sempre via service existente ou reset
  // de estado equivalente ao que os próprios workers fariam; sempre com
  // MonitorAdminActionLog.
  // ---------------------------------------------------------------------
  async requeueMatchJob(adminId: string, id: string) {
    const job = await this.database.monitorMatchJob.findUnique({
      where: { id },
    });
    if (!job) {
      throw new NotFoundException("match job not found");
    }

    await this.database.monitorMatchJob.update({
      where: { id },
      data: { status: "PENDING", attempts: 0, lastError: null },
    });

    await this.logAction(
      adminId,
      "requeue_match_job",
      "MonitorMatchJob",
      id,
      "ok",
      {
        jobId: job.jobId,
        previousStatus: job.status,
      },
    );

    return { requeued: true };
  }

  async requeueProfileMatchJob(adminId: string, id: string) {
    const job = await this.database.monitorProfileMatchJob.findUnique({
      where: { id },
    });
    if (!job) {
      throw new NotFoundException("profile match job not found");
    }

    await this.database.monitorProfileMatchJob.update({
      where: { id },
      data: { status: "PENDING", attempts: 0, lastError: null },
    });

    await this.logAction(
      adminId,
      "requeue_profile_match_job",
      "MonitorProfileMatchJob",
      id,
      "ok",
      { userId: job.userId, previousStatus: job.status },
    );

    return { requeued: true };
  }

  async forceUserRematch(adminId: string, userId: string) {
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("user not found");
    }

    const result = await this.profileMatchService.forceRematch(userId);

    await this.logAction(
      adminId,
      "force_user_rematch",
      "UserRadarProfile",
      userId,
      result.enqueued ? "ok" : "skipped",
      result.enqueued ? undefined : { reason: result.reason },
    );

    return result;
  }

  async resendDigest(adminId: string, id: string) {
    const digest = await this.database.monitorDigest.findUnique({
      where: { id },
    });
    if (!digest) {
      throw new NotFoundException("digest not found");
    }

    if (digest.status !== "FAILED") {
      await this.logAction(
        adminId,
        "resend_digest",
        "MonitorDigest",
        id,
        "skipped",
        { reason: "not_failed", currentStatus: digest.status },
      );
      return { requeued: false, reason: "not_failed" as const };
    }

    // Só reseta o estado — o próprio MonitorDigestWorker processa o próximo
    // PENDING no tick seguinte (cron a cada 30s), reaproveitando a MESMA
    // Idempotency-Key (monitor-digest:${id}) já usada no Resend. Nunca
    // chamamos MonitorDigestEmailService diretamente daqui: duplicaria o
    // caminho de envio em vez de reusar o worker.
    await this.database.monitorDigest.update({
      where: { id },
      data: { status: "PENDING", attempts: 0, lastError: null },
    });

    await this.logAction(adminId, "resend_digest", "MonitorDigest", id, "ok", {
      previousStatus: digest.status,
    });

    return { requeued: true };
  }

  // ---------------------------------------------------------------------
  // §14 Alerta de Vagas (/admin/alerta-vagas) — elegibilidade + disparo
  // manual, histórico, agendamento e conteúdo do e-mail. Ver
  // docs/specs/2026-09-04-admin-alerta-vagas-tab.md para o plano completo.
  // ---------------------------------------------------------------------

  // A tabela de elegibilidade não lista a base inteira de usuários — só
  // quem já tem MonitorAlertPreference (mexeu na própria preferência, ou
  // foi incluído aqui por um admin via trackAlertUser). Ver decisão no
  // doc: buscar sobre todos os usuários poluiria a tela com milhares de
  // candidatos irrelevantes.
  async listTrackedAlertUsers(params: {
    page?: number;
    limit?: number;
    query?: string;
  }) {
    const { page, limit, skip } = paginate(params.page, params.limit);
    const query = params.query?.trim();

    const where: Prisma.UserWhereInput = {
      monitorAlertPreference: { isNot: null },
      ...(query
        ? {
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.database.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          internalRole: true,
          monitorAlertPreference: {
            select: { frequency: true, emailEnabled: true },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.database.user.count({ where }),
    ]);

    const entitledIds = await this.entitlementService.filterEntitledUserIds(
      users.map((user) => user.id),
    );

    return {
      page,
      limit,
      total,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        internalRole: user.internalRole,
        entitledToday: entitledIds.has(user.id),
        frequency: user.monitorAlertPreference?.frequency ?? "OFF",
      })),
    };
  }

  // Idempotente por natureza (MonitorAlertPreferenceService.getOrCreate já
  // é upsert) — chamar duas vezes pro mesmo usuário nunca altera uma
  // frequência que ele já tenha configurado sozinho.
  async trackAlertUser(adminId: string, userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException("user not found");
    }

    const preference = await this.alertPreferenceService.getOrCreate(userId);

    await this.logAction(
      adminId,
      "alert_preference_tracked",
      "MonitorAlertPreference",
      userId,
      "ok",
      { frequency: preference.frequency },
    );

    return { tracked: true, frequency: preference.frequency };
  }

  // Disparo síncrono: a requisição só retorna depois que o e-mail foi de
  // fato enviado (ou definitivamente pulado) — nunca enfileira pro
  // MonitorDigestWorker. Reaproveita a mesma sequência do script
  // apps/api/src/scripts/trigger-monitor-digest.ts, agora como endpoint
  // admin. userId (nunca e-mail solto) e frequência sempre lida do
  // MonitorAlertPreference do próprio usuário — nunca escolhida avulsa
  // nesta chamada (ver decisão de design no doc do plano).
  async sendDigestNow(adminId: string, userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new NotFoundException("user not found");
    }

    const preference = await this.database.monitorAlertPreference.findUnique({
      where: { userId },
    });
    if (!preference || preference.frequency === "OFF") {
      throw new UnprocessableEntityException(
        "user has no active alert frequency (OFF or never configured)",
      );
    }

    const entitlement = await this.entitlementService.canUseMonitor(userId);
    if (!entitlement.allowed) {
      await this.logAction(
        adminId,
        "digest_manual_send",
        "MonitorDigest",
        userId,
        "skipped",
        { reason: "not_entitled" },
      );
      return { sent: false, skippedReason: "not_entitled" as const };
    }

    const frequency = preference.frequency;
    const now = new Date();
    const scheduledFor =
      frequency === "WEEKLY" ? startOfIsoWeekUtc(now) : startOfUtcDay(now);

    const existing = await this.database.monitorDigest.findUnique({
      where: {
        userId_frequency_scheduledFor: { userId, frequency, scheduledFor },
      },
    });
    if (existing) {
      await this.database.monitorDigest.delete({ where: { id: existing.id } });
    }

    const eligible =
      await this.digestContentService.getEligibleRecommendations(userId);
    if (eligible.length === 0) {
      await this.logAction(
        adminId,
        "digest_manual_send",
        "MonitorDigest",
        userId,
        "skipped",
        { reason: "no_eligible_recommendations" },
      );
      return {
        sent: false,
        skippedReason: "no_eligible_recommendations" as const,
      };
    }

    const digest = await this.database.monitorDigest.create({
      data: {
        userId,
        frequency,
        scheduledFor,
        status: "PROCESSING",
        source: "ADMIN_MANUAL",
        triggeredByAdminId: adminId,
        recommendations: {
          create: eligible.map((recommendation) => ({
            recommendationId: recommendation.id,
          })),
        },
      },
    });

    let result: Awaited<ReturnType<typeof this.digestEmailService.sendDigest>>;
    try {
      result = await this.digestEmailService.sendDigest(digest.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      await this.database.monitorDigest.update({
        where: { id: digest.id },
        data: { status: "FAILED", attempts: 1, lastError: message },
      });
      await this.logAction(
        adminId,
        "digest_manual_send",
        "MonitorDigest",
        digest.id,
        "failed",
        { userId, email: user.email, frequency, error: message },
      );
      return {
        sent: false,
        digestId: digest.id,
        recommendationCount: eligible.length,
        skippedReason: "send_failed" as const,
      };
    }

    if (result.sent) {
      await this.database.monitorDigest.update({
        where: { id: digest.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
        },
      });
    } else {
      await this.database.monitorDigest.update({
        where: { id: digest.id },
        data: { status: "SKIPPED", lastError: result.skippedReason },
      });
    }

    await this.logAction(
      adminId,
      "digest_manual_send",
      "MonitorDigest",
      digest.id,
      result.sent ? "ok" : "skipped",
      {
        userId,
        email: user.email,
        frequency,
        recommendationCount: eligible.length,
        ...(result.sent ? {} : { skippedReason: result.skippedReason }),
      },
    );

    return {
      sent: result.sent,
      digestId: digest.id,
      recommendationCount: eligible.length,
      skippedReason: result.sent ? null : result.skippedReason,
    };
  }

  async listDigestHistory(params: {
    page?: number;
    limit?: number;
    userQuery?: string;
    source?: DigestHistorySourceFilter;
  }) {
    const { page, limit, skip } = paginate(params.page, params.limit);
    const userQuery = params.userQuery?.trim();

    const where: Prisma.MonitorDigestWhereInput = {
      ...(params.source
        ? {
            source: params.source === "MANUAL" ? "ADMIN_MANUAL" : "SCHEDULER",
          }
        : {}),
      ...(userQuery
        ? {
            user: {
              OR: [
                { email: { contains: userQuery, mode: "insensitive" } },
                { name: { contains: userQuery, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const [digests, total] = await Promise.all([
      this.database.monitorDigest.findMany({
        where,
        select: {
          id: true,
          frequency: true,
          status: true,
          scheduledFor: true,
          sentAt: true,
          source: true,
          triggeredByAdminId: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.database.monitorDigest.count({ where }),
    ]);

    const adminIds = Array.from(
      new Set(
        digests
          .map((digest) => digest.triggeredByAdminId)
          .filter((id): id is string => id !== null),
      ),
    );
    const admins = adminIds.length
      ? await this.database.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const adminById = new Map(admins.map((admin) => [admin.id, admin]));

    return {
      page,
      limit,
      total,
      items: digests.map((digest) => ({
        id: digest.id,
        frequency: digest.frequency,
        status: digest.status,
        scheduledFor: digest.scheduledFor,
        sentAt: digest.sentAt,
        createdAt: digest.createdAt,
        source: digest.source,
        triggeredByAdmin: digest.triggeredByAdminId
          ? (adminById.get(digest.triggeredByAdminId) ?? null)
          : null,
        user: digest.user,
      })),
    };
  }

  async getDigestSchedule() {
    const config = await this.database.monitorDigestScheduleConfig.findUnique({
      where: { id: "default" },
    });
    return config ?? { id: "default", ...DEFAULT_SCHEDULE_CONFIG };
  }

  async updateDigestSchedule(adminId: string, dto: UpdateDigestScheduleDto) {
    const updated = await this.database.monitorDigestScheduleConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...dto, updatedByAdminId: adminId },
      update: { ...dto, updatedByAdminId: adminId },
    });

    await this.logAction(
      adminId,
      "digest_schedule_updated",
      "MonitorDigestScheduleConfig",
      "default",
      "ok",
      { ...dto },
    );

    return updated;
  }

  async getDigestContent() {
    const content = await this.database.monitorDigestEmailContent.findUnique({
      where: { id: "default" },
    });
    return (
      content ?? {
        id: "default",
        subject: DEFAULT_SUBJECT_TEMPLATE,
        introText: DEFAULT_INTRO_TEXT,
      }
    );
  }

  async updateDigestContent(adminId: string, dto: UpdateDigestContentDto) {
    const updated = await this.database.monitorDigestEmailContent.upsert({
      where: { id: "default" },
      create: { id: "default", ...dto, updatedByAdminId: adminId },
      update: { ...dto, updatedByAdminId: adminId },
    });

    await this.logAction(
      adminId,
      "digest_content_updated",
      "MonitorDigestEmailContent",
      "default",
      "ok",
      {
        subjectLength: dto.subject.length,
        introTextLength: dto.introText.length,
      },
    );

    return updated;
  }

  private async logAction(
    adminId: string,
    action: string,
    entityType: string,
    entityId: string,
    result: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.database.monitorAdminActionLog.create({
      data: {
        adminId,
        action,
        entityType,
        entityId,
        result,
        metadataJson: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
