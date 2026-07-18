import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

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

function isAdaptationUnlocked(adaptation: {
  status?: string | null;
  isUnlocked?: boolean | null;
}): boolean {
  return adaptation.isUnlocked === true || adaptation.status === "delivered";
}

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

  // Chamada de LLM aqui rodava inteira dentro do request (POST .../interview-prep),
  // mesmo risco de timeout de proxy que MASTERCV/CV_GENERATION/analyze já tinham
  // (ver plano de LLM síncronas → assíncronas). generateOrGet agora só faz as
  // validações rápidas e cria/reseta a linha com status pending, devolvendo na
  // hora — a geração roda em background em processInterviewPrepJob. O client
  // faz "polling" chamando este mesmo endpoint de novo (idempotente: se já
  // existe uma linha em qualquer status, ela é só retornada).
  async generateOrGet(
    userId: string,
    applicationId: string,
    adaptationId?: string,
  ) {
    const application = await this.database.jobApplication.findFirst({
      where: { id: applicationId, userId },
      include: {
        interviewPrep: true,
        cvAdaptations: {
          where: { id: { not: undefined } },
          select: {
            id: true,
            status: true,
            isUnlocked: true,
            jobDescriptionText: true,
            adaptedContentJson: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    const existingPrep = application.interviewPrep;
    if (existingPrep && existingPrep.status !== "failed") {
      this.logger.log(
        `[interview-prep] returning existing (status=${existingPrep.status}) — jobApplicationId=${applicationId} userId=${userId}`,
      );
      return existingPrep;
    }

    const resolvedAdaptationId =
      adaptationId ?? application.currentCvAdaptationId;

    if (!resolvedAdaptationId) {
      throw new ConflictException(
        "Defina o CV desta candidatura antes de preparar sua entrevista.",
      );
    }

    const currentAdaptation =
      application.cvAdaptations.find((cv) => cv.id === resolvedAdaptationId) ??
      null;

    if (!currentAdaptation) {
      throw new ConflictException(
        "Defina o CV desta candidatura antes de preparar sua entrevista.",
      );
    }

    if (!isAdaptationUnlocked(currentAdaptation)) {
      throw new ConflictException(
        "Libere o CV desta vaga para preparar sua entrevista.",
      );
    }

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

    // Persist the selected adaptation so interviewPrepLocked resolves correctly.
    if (adaptationId && adaptationId !== application.currentCvAdaptationId) {
      await this.database.jobApplication.update({
        where: { id: applicationId },
        data: { currentCvAdaptationId: adaptationId },
      });
    }

    const prep = existingPrep
      ? await this.database.jobApplicationInterviewPrep.update({
          where: { id: existingPrep.id },
          data: {
            status: "pending",
            lastError: null,
            generatedContentJson: Prisma.JsonNull,
            generatedAt: null,
            startedAt: null,
            finishedAt: null,
          },
        })
      : await this.database.jobApplicationInterviewPrep.create({
          data: {
            jobApplicationId: applicationId,
            status: "pending",
          },
        });

    this.logger.log(
      `[interview-prep] queued — jobApplicationId=${applicationId} userId=${userId} prepId=${prep.id} hasJobDescription=${usedJobDescription} hasStructuredData=${usedStructuredData} pastReflections=${pastProcessesReflections.length}`,
    );

    this.processInterviewPrepJob(prep.id, {
      applicationId,
      userId,
      context,
      usedJobDescription,
      usedStructuredData,
      usedPastReflections,
    }).catch((err) => {
      this.logger.error(
        `[interview-prep] ${prep.id} background processing crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return prep;
  }

  private async processInterviewPrepJob(
    prepId: string,
    input: {
      applicationId: string;
      userId: string;
      context: InterviewPrepContext;
      usedJobDescription: boolean;
      usedStructuredData: boolean;
      usedPastReflections: boolean;
    },
  ): Promise<void> {
    const { applicationId, userId, context } = input;

    await this.database.jobApplicationInterviewPrep.update({
      where: { id: prepId },
      data: { status: "processing", startedAt: new Date() },
    });

    let content: InterviewPrepContent;
    try {
      content = await this.aiService.generate(context);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI error";
      this.logger.error(
        `[interview-prep] generation failed — jobApplicationId=${applicationId} prepId=${prepId} error=${msg}`,
      );
      await this.database.jobApplicationInterviewPrep.update({
        where: { id: prepId },
        data: { status: "failed", lastError: msg, finishedAt: new Date() },
      });
      return;
    }

    const result = await this.database.$transaction(async (tx) => {
      const updated = await tx.jobApplicationInterviewPrep.update({
        where: { id: prepId },
        data: {
          status: "succeeded",
          generatedContentJson: content as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
          finishedAt: new Date(),
        },
      });

      await tx.jobApplicationEvent.create({
        data: {
          jobApplicationId: applicationId,
          eventType: "INTERVIEW_PREP_GENERATED",
          metadata: {
            usedJobDescription: input.usedJobDescription,
            usedStructuredData: input.usedStructuredData,
            usedPastReflections: input.usedPastReflections,
          },
        },
      });

      return updated;
    });

    this.logger.log(
      `[interview-prep] generated — jobApplicationId=${applicationId} prepId=${result.id}`,
    );

    if (!this.funnelEvents) {
      return;
    }

    const prepContent = content as { questionsTheyMayAsk?: unknown[] };
    await this.funnelEvents
      .record(
        {
          eventName: "interview_prep_generated",
          eventVersion: 1,
          idempotencyKey: `interview_prep_generated:${result.id}`,
          metadata: {
            has_previous_rejection_context: input.usedPastReflections,
            used_job_description: input.usedJobDescription,
            used_structured_data: input.usedStructuredData,
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
  }
}
