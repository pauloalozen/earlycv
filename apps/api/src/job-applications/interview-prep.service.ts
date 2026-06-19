import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { DatabaseService } from "../database/database.service";
import type {
  InterviewPrepContent,
  InterviewPrepContext,
  PastProcessReflection,
} from "./interview-prep-ai.service";
import { InterviewPrepAiService } from "./interview-prep-ai.service";

type AdaptedContentJson = {
  pontos_fortes?: string[];
  lacunas?: string[];
  melhorias_aplicadas?: string[];
  fit?: { headline?: string };
};

function extractStructuredAnalysis(
  raw: Prisma.JsonValue | null | undefined,
): InterviewPrepContext["structuredAnalysis"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const json = raw as AdaptedContentJson;

  const pontosFortes = Array.isArray(json.pontos_fortes)
    ? json.pontos_fortes
    : [];
  const lacunas = Array.isArray(json.lacunas) ? json.lacunas : [];
  const melhoriasAplicadas = Array.isArray(json.melhorias_aplicadas)
    ? json.melhorias_aplicadas
    : [];
  const fitHeadline =
    json.fit && typeof json.fit.headline === "string" ? json.fit.headline : "";

  if (
    pontosFortes.length === 0 &&
    lacunas.length === 0 &&
    melhoriasAplicadas.length === 0 &&
    !fitHeadline
  ) {
    return null;
  }

  return { pontosFortes, lacunas, melhoriasAplicadas, fitHeadline };
}

@Injectable()
export class JobApplicationInterviewPrepService {
  private readonly logger = new Logger(JobApplicationInterviewPrepService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(InterviewPrepAiService)
    private readonly aiService: InterviewPrepAiService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
  ) {}

  async generateOrGet(userId: string, applicationId: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id: applicationId, userId },
      include: {
        interviewPrep: true,
        cvAdaptations: {
          where: { id: { not: undefined } },
          select: {
            id: true,
            jobDescriptionText: true,
            adaptedContentJson: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    if (application.interviewPrep) {
      this.logger.log(
        `[interview-prep] returning existing — jobApplicationId=${applicationId} userId=${userId}`,
      );
      return application.interviewPrep;
    }

    const currentAdaptation = application.currentCvAdaptationId
      ? (application.cvAdaptations.find(
          (cv) => cv.id === application.currentCvAdaptationId,
        ) ?? application.cvAdaptations[0])
      : application.cvAdaptations[0];

    const jobDescriptionText =
      application.jobDescriptionText ??
      currentAdaptation?.jobDescriptionText ??
      null;

    const structuredAnalysis = currentAdaptation?.adaptedContentJson
      ? extractStructuredAnalysis(currentAdaptation.adaptedContentJson)
      : null;

    const pastRejected = await this.database.jobApplication.findMany({
      where: {
        userId,
        status: "REJECTED",
        OR: [
          { rejectionStrengths: { not: null } },
          { rejectionImprovements: { not: null } },
        ],
      },
      select: {
        jobTitle: true,
        companyName: true,
        rejectionStrengths: true,
        rejectionImprovements: true,
      },
    });

    const pastProcessesReflections: PastProcessReflection[] = pastRejected.map(
      (r) => ({
        jobTitle: r.jobTitle,
        companyName: r.companyName,
        strengths: r.rejectionStrengths,
        improvements: r.rejectionImprovements,
      }),
    );

    const usedJobDescription = Boolean(jobDescriptionText);
    const usedStructuredData = Boolean(structuredAnalysis);
    const usedPastReflections = pastProcessesReflections.length > 0;

    this.logger.log(
      `[interview-prep] generating — jobApplicationId=${applicationId} userId=${userId} hasJobDescription=${usedJobDescription} hasStructuredData=${usedStructuredData} pastReflections=${pastProcessesReflections.length}`,
    );

    const context: InterviewPrepContext = {
      jobTitle: application.jobTitle,
      companyName: application.companyName,
      location: application.location,
      jobDescriptionText,
      scoreBefore: application.scoreBefore,
      scoreAfter: application.scoreAfter,
      structuredAnalysis,
      pastProcessesReflections: usedPastReflections
        ? pastProcessesReflections
        : null,
    };

    let content: InterviewPrepContent;
    try {
      content = await this.aiService.generate(context);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI error";
      this.logger.error(
        `[interview-prep] generation failed — jobApplicationId=${applicationId} error=${msg}`,
      );
      throw error;
    }

    const result = await this.database.$transaction(async (tx) => {
      const prep = await tx.jobApplicationInterviewPrep.create({
        data: {
          jobApplicationId: applicationId,
          generatedContentJson: content as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.jobApplicationEvent.create({
        data: {
          jobApplicationId: applicationId,
          eventType: "INTERVIEW_PREP_GENERATED",
          metadata: {
            usedJobDescription,
            usedStructuredData,
            usedPastReflections,
          },
        },
      });

      return prep;
    });

    this.logger.log(
      `[interview-prep] generated — jobApplicationId=${applicationId} prepId=${result.id}`,
    );

    const prepContent = content as {
      questionsTheyMayAsk?: unknown[];
    };
    await this.funnelEvents
      .record(
        {
          eventName: "interview_prep_generated",
          eventVersion: 1,
          idempotencyKey: `interview_prep_generated:${result.id}`,
          metadata: {
            has_previous_rejection_context: usedPastReflections,
            used_job_description: usedJobDescription,
            used_structured_data: usedStructuredData,
            questions_count: Array.isArray(prepContent.questionsTheyMayAsk)
              ? prepContent.questionsTheyMayAsk.length
              : 0,
          },
        },
        {
          correlationId: `interview-prep:${applicationId}`,
          ip: null,
          requestId: `interview-prep:${result.id}`,
          routePath: "/api/job-applications/:id/interview-prep",
          sessionInternalId: null,
          sessionPublicToken: null,
          userAgentHash: null,
          userId,
        },
        "backend",
      )
      .catch((err: unknown) => {
        this.logger.warn(
          `[interview-prep] failed to record interview_prep_generated: ${err}`,
        );
      });

    return result;
  }
}
