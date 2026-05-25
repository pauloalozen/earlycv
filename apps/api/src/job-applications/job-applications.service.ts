import {
  BadRequestException,
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
    status?: JobApplicationStatus,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.JobApplicationWhereInput = {
      userId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      this.database.jobApplication.findMany({
        where,
        include: {
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

    return { items, total };
  }

  async getById(userId: string, id: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId },
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
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    return application;
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

  async updateStatus(userId: string, id: string, newStatus: JobApplicationStatus) {
    const application = await this.database.jobApplication.findFirst({
      where: { id, userId },
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
      where: { id, userId },
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

  async upsertFromCvAdaptation(input: UpsertFromAdaptationInput): Promise<void> {
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
        `[job-applications] upsertFromCvAdaptation skipped — missing jobTitle or companyName for adaptation ${cvAdaptationId}`,
      );
      return;
    }

    const normalizedJobTitle = normalize(jobTitle);
    const normalizedCompanyName = normalize(companyName);

    await this.database.$transaction(async (tx) => {
      // Check if CvAdaptation already has a jobApplicationId
      const adaptation = await tx.cvAdaptation.findUnique({
        where: { id: cvAdaptationId },
        select: { jobApplicationId: true },
      });

      if (!adaptation) {
        this.logger.warn(
          `[job-applications] upsertFromCvAdaptation — adaptation ${cvAdaptationId} not found`,
        );
        return;
      }

      let application: { id: string; status: JobApplicationStatus } | null = null;

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
        const shouldAdvance = this.isLaterStatus(application.status, targetStatus);

        await tx.jobApplication.update({
          where: { id: application.id },
          data: {
            currentCvAdaptationId: cvAdaptationId,
            ...(scoreBefore !== undefined && scoreBefore !== null
              ? { scoreBefore }
              : {}),
            ...(scoreAfter !== undefined && scoreAfter !== null
              ? { scoreAfter }
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
            scoreBefore: scoreBefore ?? null,
            scoreAfter: scoreAfter ?? null,
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
