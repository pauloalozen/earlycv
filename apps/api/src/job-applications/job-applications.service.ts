import { normalizeData } from "@earlycv/config/cv-analysis-normalize";
import { resolveCvAnalysisScores } from "@earlycv/config/cv-analysis-score";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  JobApplicationOrigin,
  JobApplicationStatus,
  Prisma,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { CreateJobApplicationDto } from "./dto/create-job-application.dto";

type UpsertFromAdaptationInput = {
  userId: string;
  cvAdaptationId: string;
  jobTitle: string | null;
  companyName: string | null;
  jobDescriptionText: string | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  targetStatus: JobApplicationStatus;
  origin: JobApplicationOrigin;
};

type CvState = "ready" | "locked" | "missing";
type ScorePresentation = "scored" | "not_analyzed";

type DerivedSummary = {
  bestScore: number | null;
  bestCvAdaptationId: string | null;
  bestCvState: CvState;
  scorePresentation: ScorePresentation;
};

type AdaptationSummaryView = {
  id: string;
  status: string;
  createdAt: Date;
  adaptedResumeId: string | null;
  isUnlocked?: boolean;
  adaptedContentJson?: unknown;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const RECENT_WINDOW_DAYS = 60;

const ACTIVE_SUMMARY_STATUSES: ReadonlySet<JobApplicationStatus> = new Set([
  "SAVED",
  "ANALYZED",
  "CV_READY",
  "APPLIED",
  "IN_PROCESS",
  "INTERVIEW",
]);

function extractAdaptationScores(content: unknown): {
  scoreBefore: number | null;
  scoreAfter: number | null;
} {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { scoreBefore: null, scoreAfter: null };
  }
  const parsed = content as Record<string, unknown>;

  const hasNormalizedPayload =
    parsed.fit &&
    typeof parsed.fit === "object" &&
    (Array.isArray(parsed.positivos) ||
      Array.isArray(parsed.ajustes_conteudo) ||
      Array.isArray(parsed.ajustes_indisponiveis) ||
      Array.isArray(parsed.pontos_fortes) ||
      Array.isArray(parsed.lacunas) ||
      Boolean(parsed.keywords && typeof parsed.keywords === "object") ||
      Boolean(parsed.formato_cv && typeof parsed.formato_cv === "object") ||
      Boolean(parsed.ats_keywords && typeof parsed.ats_keywords === "object"));

  if (hasNormalizedPayload) {
    try {
      const data = normalizeData(parsed as never);
      const scoreAfter = data.score.scoreAposLiberarBase;
      return { scoreBefore: data.score.scoreAtualBase, scoreAfter };
    } catch {
      // fall through to legacy path
    }
  }

  // Legacy / scalar fallback
  const result = resolveCvAnalysisScores(content);
  return { scoreBefore: result.scoreBefore, scoreAfter: result.scoreAfter };
}

function extractScoreBeforeFromContent(content: unknown): number | null {
  return extractAdaptationScores(content).scoreBefore;
}

function extractScoreAfterFromContent(content: unknown): number | null {
  return extractAdaptationScores(content).scoreAfter;
}

function deriveSummaryFromAdaptations(
  adaptations: AdaptationSummaryView[],
): DerivedSummary {
  const scored = adaptations
    .map((adaptation) => {
      const scoreAfter = extractScoreAfterFromContent(
        adaptation.adaptedContentJson,
      );
      const isUnlocked =
        adaptation.isUnlocked ?? adaptation.status === "delivered";
      const isReady = isUnlocked;

      return {
        id: adaptation.id,
        createdAt: adaptation.createdAt,
        scoreAfter,
        isReady,
        isUnlocked,
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        createdAt: Date;
        scoreAfter: number;
        isReady: boolean;
        isUnlocked: boolean;
      } => item.scoreAfter !== null,
    );

  if (scored.length === 0) {
    return {
      bestScore: null,
      bestCvAdaptationId: null,
      bestCvState: "missing",
      scorePresentation: "not_analyzed",
    };
  }

  scored.sort((a, b) => {
    if (b.scoreAfter !== a.scoreAfter) return b.scoreAfter - a.scoreAfter;
    if (a.isReady !== b.isReady) return a.isReady ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const best = scored[0];

  return {
    bestScore: best.scoreAfter,
    bestCvAdaptationId: best.id,
    bestCvState: best.isUnlocked ? "ready" : "locked",
    scorePresentation: "scored",
  };
}

@Injectable()
export class JobApplicationsService {
  private readonly logger = new Logger(JobApplicationsService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async list(
    userId: string,
    page: number = 1,
    limit: number = 20,
    archived = false,
    status?: JobApplicationStatus,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.JobApplicationWhereInput = {
      userId,
      deletedAt: null,
      archivedAt: archived ? { not: null } : null,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      this.database.jobApplication.findMany({
        where,
        include: {
          cvAdaptations: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              adaptedResumeId: true,
              isUnlocked: true,
              adaptedContentJson: true,
            },
          },
          events: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          interviewPrep: { select: { id: true, generatedAt: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      this.database.jobApplication.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        ...deriveSummaryFromAdaptations(
          item.cvAdaptations as AdaptationSummaryView[],
        ),
      })),
      total,
    };
  }

  async listHighlights(userId: string, limit = 3) {
    const items = await this.database.jobApplication.findMany({
      where: { userId, archivedAt: null, deletedAt: null },
      include: {
        cvAdaptations: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            adaptedResumeId: true,
            isUnlocked: true,
            adaptedContentJson: true,
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        interviewPrep: { select: { id: true, generatedAt: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return items
      .map((item) => ({
        ...item,
        ...deriveSummaryFromAdaptations(
          item.cvAdaptations as AdaptationSummaryView[],
        ),
        currentCvAdaptationId: item.currentCvAdaptationId,
      }))
      .slice(0, Math.max(1, limit));
  }

  async getHighlightsSummary(userId: string) {
    const items = await this.database.jobApplication.findMany({
      where: { userId, archivedAt: null, deletedAt: null },
      select: {
        status: true,
        scoreAfter: true,
        cvAdaptations: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            adaptedResumeId: true,
            isUnlocked: true,
            adaptedContentJson: true,
          },
        },
      },
    });

    let activeApplicationsCount = 0;
    let analyzedCvsCount = 0;
    let scoredCount = 0;
    let totalScore = 0;

    for (const item of items) {
      if (ACTIVE_SUMMARY_STATUSES.has(item.status)) {
        activeApplicationsCount += 1;
      }

      if (item.cvAdaptations.length > 0) {
        analyzedCvsCount += item.cvAdaptations.length;
      } else if (typeof item.scoreAfter === "number") {
        analyzedCvsCount += 1;
      }

      const summary = deriveSummaryFromAdaptations(
        item.cvAdaptations as AdaptationSummaryView[],
      );
      const resolvedScore =
        summary.bestScore ??
        (item.cvAdaptations.length === 0 && typeof item.scoreAfter === "number"
          ? item.scoreAfter
          : null);

      if (resolvedScore !== null) {
        scoredCount += 1;
        totalScore += resolvedScore;
      }
    }

    return {
      activeApplicationsCount,
      analyzedCvsCount,
      averageScore:
        scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
    };
  }

  async getById(userId: string, id: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        events: { orderBy: { createdAt: "asc" } },
        interviewPrep: true,
        cvAdaptations: {
          select: {
            id: true,
            status: true,
            jobTitle: true,
            companyName: true,
            isUnlocked: true,
            adaptedResumeId: true,
            adaptedContentJson: true,
            analysisCvSnapshotId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    const mappedAdaptations = application.cvAdaptations.map((a) => {
      const { adaptedContentJson, analysisCvSnapshotId, ...rest } = a;
      return {
        ...rest,
        scoreBefore: extractScoreBeforeFromContent(adaptedContentJson),
        scoreAfter: extractScoreAfterFromContent(adaptedContentJson),
        canDownloadBaseCv: Boolean(analysisCvSnapshotId),
      };
    });

    return {
      ...application,
      cvAdaptations: mappedAdaptations,
      ...deriveSummaryFromAdaptations(
        application.cvAdaptations as AdaptationSummaryView[],
      ),
    };
  }

  async createManual(userId: string, dto: CreateJobApplicationDto) {
    const origin: JobApplicationOrigin = dto.origin ?? "manual";

    if (origin === "imported_url" && !dto.jobUrl) {
      throw new BadRequestException(
        "jobUrl é obrigatório quando a origem é imported_url.",
      );
    }

    const normalizedJobTitle = normalize(dto.jobTitle);
    const normalizedCompanyName = normalize(dto.companyName);

    const application = await this.database.$transaction(async (tx) => {
      const created = await tx.jobApplication.create({
        data: {
          userId,
          jobTitle: dto.jobTitle,
          companyName: dto.companyName,
          normalizedJobTitle,
          normalizedCompanyName,
          location: dto.location ?? null,
          jobUrl: dto.jobUrl ?? null,
          jobDescriptionText: dto.jobDescriptionText ?? null,
          status: "SAVED",
          origin,
          notes: dto.notes ?? null,
        },
        include: {
          events: true,
        },
      });

      await tx.jobApplicationEvent.create({
        data: {
          jobApplicationId: created.id,
          eventType: "APPLICATION_CREATED",
          newStatus: "SAVED",
          metadata: { origin },
        },
      });

      return created;
    });

    return application;
  }

  async submitRejectionFeedback(
    userId: string,
    id: string,
    data: { rejectionStrengths?: string; rejectionImprovements?: string },
  ) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    return this.database.$transaction(async (tx) => {
      const result = await tx.jobApplication.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionStrengths: data.rejectionStrengths ?? null,
          rejectionImprovements: data.rejectionImprovements ?? null,
        },
      });

      await tx.jobApplicationEvent.create({
        data: {
          jobApplicationId: id,
          eventType: "STATUS_CHANGED",
          previousStatus: application.status,
          newStatus: "REJECTED",
        },
      });

      return result;
    });
  }

  async scheduleInterview(
    userId: string,
    id: string,
    data: {
      scheduledAt: string;
      interviewTitle: string;
      interviewerName?: string;
      interviewMeetingUrl?: string;
      interviewLocation?: string;
    },
  ) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    const previousStatus = application.status;

    return this.database.$transaction(async (tx) => {
      const result = await tx.jobApplication.update({
        where: { id },
        data: {
          status: "INTERVIEW",
          nextActionAt: new Date(data.scheduledAt),
          interviewTitle: data.interviewTitle,
          interviewerName: data.interviewerName ?? null,
          interviewMeetingUrl: data.interviewMeetingUrl ?? null,
          interviewLocation: data.interviewLocation ?? null,
        },
      });

      await tx.jobApplicationEvent.create({
        data: {
          jobApplicationId: id,
          eventType: "STATUS_CHANGED",
          previousStatus,
          newStatus: "INTERVIEW",
          metadata: { interviewTitle: data.interviewTitle },
        },
      });

      return result;
    });
  }

  async updateUrl(userId: string, id: string, jobUrl: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    return this.database.jobApplication.update({
      where: { id },
      data: { jobUrl },
    });
  }

  async updateStatus(
    userId: string,
    id: string,
    newStatus: JobApplicationStatus,
    currentCvAdaptationId?: string,
  ) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    const previousStatus = application.status;

    const appliedAt =
      newStatus === "APPLIED" && !application.appliedAt
        ? new Date()
        : undefined;

    const updated = await this.database.$transaction(async (tx) => {
      const result = await tx.jobApplication.update({
        where: { id },
        data: {
          status: newStatus,
          ...(appliedAt !== undefined ? { appliedAt } : {}),
          ...(currentCvAdaptationId !== undefined
            ? { currentCvAdaptationId }
            : {}),
        },
      });

      await tx.jobApplicationEvent.create({
        data: {
          jobApplicationId: id,
          eventType:
            newStatus === "APPLIED" ? "MARKED_AS_SENT" : "STATUS_CHANGED",
          previousStatus,
          newStatus,
        },
      });

      return result;
    });

    return updated;
  }

  async addNote(userId: string, id: string, note: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    const updated = await this.database.$transaction(async (tx) => {
      const result = await tx.jobApplication.update({
        where: { id },
        data: { notes: note },
      });

      await tx.jobApplicationEvent.create({
        data: {
          jobApplicationId: id,
          eventType: "NOTE_ADDED",
          metadata: { noteLength: note.length },
        },
      });

      return result;
    });

    return updated;
  }

  async archive(userId: string, id: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, archivedAt: true },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    if (application.archivedAt === null) {
      await this.database.jobApplication.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
    }

    return this.getById(userId, id);
  }

  async restore(userId: string, id: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, archivedAt: true },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    if (application.archivedAt !== null) {
      await this.database.jobApplication.update({
        where: { id },
        data: { archivedAt: null },
      });
    }

    return this.getById(userId, id);
  }

  async delete(userId: string, id: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, archivedAt: true },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    if (application.archivedAt === null) {
      throw new ConflictException(
        "A candidatura precisa estar arquivada para ser excluida.",
      );
    }

    const unlockedAdaptation = await this.database.cvAdaptation.findFirst({
      where: {
        jobApplicationId: id,
        OR: [{ isUnlocked: true }, { status: "delivered" }],
      },
      select: { id: true },
    });

    if (unlockedAdaptation) {
      throw new ConflictException(
        "Nao e possivel excluir candidatura com CV liberado.",
      );
    }

    return this.database.jobApplication.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async upsertFromCvAdaptation(
    input: UpsertFromAdaptationInput,
  ): Promise<void> {
    const {
      userId,
      cvAdaptationId,
      jobTitle,
      companyName,
      jobDescriptionText,
      scoreBefore,
      scoreAfter,
      targetStatus,
      origin,
    } = input;

    if (!jobTitle || !companyName) {
      this.logger.warn(
        `[job-applications] missing jobTitle or companyName for adaptation ${cvAdaptationId}; persistence deferred`,
      );
      return;
    }

    const normalizedJobTitle = normalize(jobTitle);
    const normalizedCompanyName = normalize(companyName);

    await this.database.$transaction(async (tx) => {
      // Check if CvAdaptation already has a jobApplicationId
      const adaptation = await tx.cvAdaptation.findUnique({
        where: { id: cvAdaptationId },
        select: { jobApplicationId: true, adaptedContentJson: true },
      });

      if (!adaptation) {
        this.logger.warn(
          `[job-applications] upsertFromCvAdaptation — adaptation ${cvAdaptationId} not found`,
        );
        return;
      }

      // Resolve scores: prefer explicit input, fall back to adaptedContentJson
      const resolvedScoreBefore =
        scoreBefore !== undefined && scoreBefore !== null
          ? scoreBefore
          : extractScoreBeforeFromContent(adaptation.adaptedContentJson);
      const resolvedScoreAfter =
        scoreAfter !== undefined && scoreAfter !== null
          ? scoreAfter
          : extractScoreAfterFromContent(adaptation.adaptedContentJson);

      let application: { id: string; status: JobApplicationStatus } | null =
        null;

      // 1. Already linked
      if (adaptation.jobApplicationId) {
        application = await tx.jobApplication.findFirst({
          where: { id: adaptation.jobApplicationId, userId },
          select: { id: true, status: true },
        });
      }

      // 2. Find existing by (userId, normalizedTitle, normalizedCompany) in recent window
      if (!application) {
        const windowStart = new Date(
          Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );

        application = await tx.jobApplication.findFirst({
          where: {
            userId,
            normalizedJobTitle,
            normalizedCompanyName,
            createdAt: { gte: windowStart },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true },
        });
      }

      const eventType =
        targetStatus === "CV_READY" ? "CV_READY" : "ANALYSIS_COMPLETED";

      if (application) {
        // Advance status only if new status is "later" in the funnel
        const shouldAdvance = this.isLaterStatus(
          application.status,
          targetStatus,
        );

        await tx.jobApplication.update({
          where: { id: application.id },
          data: {
            currentCvAdaptationId: cvAdaptationId,
            ...(resolvedScoreBefore !== null
              ? { scoreBefore: resolvedScoreBefore }
              : {}),
            ...(resolvedScoreAfter !== null
              ? { scoreAfter: resolvedScoreAfter }
              : {}),
            ...(shouldAdvance ? { status: targetStatus } : {}),
          },
        });

        await tx.cvAdaptation.update({
          where: { id: cvAdaptationId },
          data: { jobApplicationId: application.id },
        });

        if (shouldAdvance) {
          await tx.jobApplicationEvent.create({
            data: {
              jobApplicationId: application.id,
              eventType,
              previousStatus: application.status,
              newStatus: targetStatus,
              metadata: { cvAdaptationId },
            },
          });
        }
      } else {
        // Create new JobApplication
        const created = await tx.jobApplication.create({
          data: {
            userId,
            jobTitle,
            companyName,
            normalizedJobTitle,
            normalizedCompanyName,
            jobDescriptionText: jobDescriptionText ?? null,
            status: targetStatus,
            origin,
            currentCvAdaptationId: cvAdaptationId,
            scoreBefore: resolvedScoreBefore,
            scoreAfter: resolvedScoreAfter,
          },
        });

        await tx.cvAdaptation.update({
          where: { id: cvAdaptationId },
          data: { jobApplicationId: created.id },
        });

        await tx.jobApplicationEvent.createMany({
          data: [
            {
              jobApplicationId: created.id,
              eventType: "APPLICATION_CREATED",
              newStatus: targetStatus,
              metadata: { origin, cvAdaptationId },
            },
            {
              jobApplicationId: created.id,
              eventType,
              newStatus: targetStatus,
              metadata: { cvAdaptationId },
            },
          ],
        });
      }
    });
  }

  async splitAnalysisIntoNewApplication(
    userId: string,
    applicationId: string,
    adaptationId: string,
  ): Promise<{ newApplicationId: string }> {
    return this.database.$transaction(async (tx) => {
      const sourceApplication = await tx.jobApplication.findFirst({
        where: { id: applicationId, userId },
      });

      if (!sourceApplication) {
        throw new NotFoundException("job application not found");
      }

      const adaptation = await tx.cvAdaptation.findUnique({
        where: { id: adaptationId },
      });

      if (!adaptation) {
        throw new NotFoundException("cv adaptation not found");
      }

      if (adaptation.userId !== userId) {
        throw new NotFoundException("cv adaptation not found");
      }

      if (adaptation.jobApplicationId !== sourceApplication.id) {
        throw new BadRequestException(
          "cv adaptation does not belong to the source application",
        );
      }

      const nextJobTitle = adaptation.jobTitle ?? sourceApplication.jobTitle;
      const nextCompanyName =
        adaptation.companyName ?? sourceApplication.companyName;
      const normalizedJobTitle = normalize(nextJobTitle);
      const normalizedCompanyName = normalize(nextCompanyName);
      const splitTargetStatus: JobApplicationStatus =
        adaptation.isUnlocked || adaptation.status === "delivered"
          ? "CV_READY"
          : "ANALYZED";

      const createdApplication = await tx.jobApplication.create({
        data: {
          userId,
          jobTitle: nextJobTitle,
          companyName: nextCompanyName,
          normalizedJobTitle,
          normalizedCompanyName,
          jobDescriptionText:
            adaptation.jobDescriptionText ??
            sourceApplication.jobDescriptionText,
          origin: sourceApplication.origin,
          status: splitTargetStatus,
          currentCvAdaptationId: adaptation.id,
          scoreBefore: extractScoreBeforeFromContent(
            adaptation.adaptedContentJson,
          ),
          scoreAfter: extractScoreAfterFromContent(
            adaptation.adaptedContentJson,
          ),
        },
      });

      await tx.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          jobApplicationId: createdApplication.id,
        },
      });

      let nextCurrentCvAdaptationId = sourceApplication.currentCvAdaptationId;
      if (sourceApplication.currentCvAdaptationId === adaptation.id) {
        const remainingAdaptations = await tx.cvAdaptation.findMany({
          where: {
            jobApplicationId: sourceApplication.id,
            id: { not: adaptation.id },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true },
        });

        nextCurrentCvAdaptationId = remainingAdaptations[0]?.id ?? null;
      }

      await tx.jobApplication.update({
        where: { id: sourceApplication.id },
        data: {
          currentCvAdaptationId: nextCurrentCvAdaptationId,
        },
      });

      await tx.jobApplicationEvent.createMany({
        data: [
          {
            jobApplicationId: sourceApplication.id,
            eventType: "NOTE_ADDED",
            metadata: {
              action: "analysis_split_out",
              separatedCvAdaptationId: adaptation.id,
              destinationJobApplicationId: createdApplication.id,
              currentCvAdaptationIdAfterSplit: nextCurrentCvAdaptationId,
            },
          },
          {
            jobApplicationId: createdApplication.id,
            eventType: "APPLICATION_CREATED",
            newStatus: splitTargetStatus,
            metadata: {
              action: "analysis_split_in",
              sourceJobApplicationId: sourceApplication.id,
              separatedCvAdaptationId: adaptation.id,
            },
          },
        ],
      });

      return { newApplicationId: createdApplication.id };
    });
  }

  // Returns true if nextStatus represents a later stage in the funnel than current.
  // User-driven statuses (APPLIED, IN_PROCESS etc.) are never overridden by automatic hooks.
  private isLaterStatus(
    current: JobApplicationStatus,
    next: JobApplicationStatus,
  ): boolean {
    const autoOrder: JobApplicationStatus[] = ["SAVED", "ANALYZED", "CV_READY"];
    const currentIdx = autoOrder.indexOf(current);
    const nextIdx = autoOrder.indexOf(next);
    // Only advance within automatic statuses; never overwrite user-set statuses
    return currentIdx !== -1 && nextIdx > currentIdx;
  }
}
