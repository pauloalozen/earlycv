import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { DatabaseService } from "../database/database.service";
import type {
  CoverLetterContent,
  CoverLetterContext,
} from "./cover-letter-ai.service";
import { CoverLetterAiService } from "./cover-letter-ai.service";
import { CoverLetterDocxService } from "./cover-letter-docx.service";
import { CoverLetterPdfService } from "./cover-letter-pdf.service";

type GenerateCoverLetterInput = {
  style: CoverLetterContext["style"];
  lengthMode: CoverLetterContext["lengthMode"];
  maxCharacters?: number | null;
  adaptationId?: string;
};

function isAdaptationUnlocked(adaptation: {
  status?: string | null;
  isUnlocked?: boolean | null;
}): boolean {
  return adaptation.isUnlocked === true || adaptation.status === "delivered";
}

function hasSections(raw: Prisma.JsonValue | null | undefined): boolean {
  return (
    raw != null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Array.isArray((raw as Record<string, unknown>).sections)
  );
}

// Resolve qual dos três campos JSON contém a saída estruturada do CV
// (com "sections"), na mesma precedência de cv-adaptation.service.ts
// (finalCvOutput): edições manuais do usuário > saída da IA, seja qual for
// o campo onde ela pousou. Usado tanto para o resumo/competências (contexto
// da IA) quanto para o cabeçalho (nome/contato, usado no prompt e no PDF/DOCX).
function resolveCvJsonSource(adaptation: {
  editedCvJson: Prisma.JsonValue | null;
  aiAuditJson: Prisma.JsonValue | null;
  adaptedContentJson: Prisma.JsonValue | null;
}): Prisma.JsonValue | null {
  return (
    (hasSections(adaptation.editedCvJson) && adaptation.editedCvJson) ||
    (hasSections(adaptation.aiAuditJson) && adaptation.aiAuditJson) ||
    (hasSections(adaptation.adaptedContentJson) &&
      adaptation.adaptedContentJson) ||
    null
  );
}

function resolveCvSummary(source: Prisma.JsonValue | null): {
  professionalSummary: string;
  highlightedSkills: string[];
} {
  if (!source || typeof source !== "object") {
    return { professionalSummary: "", highlightedSkills: [] };
  }

  const obj = source as Record<string, unknown>;
  return {
    professionalSummary: typeof obj.summary === "string" ? obj.summary : "",
    highlightedSkills: Array.isArray(obj.highlightedSkills)
      ? obj.highlightedSkills.filter((s): s is string => typeof s === "string")
      : [],
  };
}

// Extrai nome e linha de contato do cabeçalho do CV adaptado desta candidatura
// específica (sectionType "header") — usado só no PDF/DOCX exportado, para
// não deixar a carta parecer um documento solto sem identidade do candidato.
function resolveCvHeader(raw: Prisma.JsonValue | null | undefined): {
  candidateName: string;
  contactLine: string;
} {
  if (!hasSections(raw)) {
    return { candidateName: "", contactLine: "" };
  }

  const obj = raw as Record<string, unknown>;
  const sections = obj.sections as Array<Record<string, unknown>>;
  const headerSection = sections.find((s) => s.sectionType === "header");
  const headerItem = (
    headerSection?.items as Array<Record<string, unknown>>
  )?.[0];

  const candidateName =
    typeof headerItem?.heading === "string" ? headerItem.heading.trim() : "";
  const bullets = Array.isArray(headerItem?.bullets)
    ? (headerItem.bullets as unknown[]).filter(
        (b): b is string => typeof b === "string" && b.trim().length > 0,
      )
    : [];

  return { candidateName, contactLine: bullets.join(" | ") };
}

type AnalysisRequirement = {
  requirementText?: string;
  coverageStatus?: string;
  gapExplanation?: string;
};

// Extrai apenas o texto curto dos gaps remanescentes e das keywords ausentes
// da análise já persistida — nunca reanalisa a vaga.
function resolveAnalysisGaps(adaptation: {
  adaptedContentJson: Prisma.JsonValue | null;
  aiAuditJson: Prisma.JsonValue | null;
}): { remainingGaps: string[]; keywords: string[] } {
  const candidates = [adaptation.adaptedContentJson, adaptation.aiAuditJson];
  const analysisSource = candidates.find(
    (raw) =>
      raw != null &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Array.isArray((raw as Record<string, unknown>).requirements),
  ) as Record<string, unknown> | undefined;

  if (!analysisSource) {
    return { remainingGaps: [], keywords: [] };
  }

  const requirements = (
    analysisSource.requirements as AnalysisRequirement[]
  ).filter((r) => r.coverageStatus && r.coverageStatus !== "covered");

  const remainingGaps = requirements
    .map((r) => r.gapExplanation || r.requirementText || "")
    .filter((text) => text.trim().length > 0)
    .slice(0, 8);

  const keywordsBlock = analysisSource.keywords as
    | { ausentes?: Array<{ kw?: string }> }
    | undefined;
  const keywords = Array.isArray(keywordsBlock?.ausentes)
    ? keywordsBlock.ausentes
        .map((k) => k.kw)
        .filter((kw): kw is string => typeof kw === "string")
        .slice(0, 10)
    : [];

  return { remainingGaps, keywords };
}

@Injectable()
export class JobApplicationCoverLetterService {
  private readonly logger = new Logger(JobApplicationCoverLetterService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CoverLetterAiService)
    private readonly aiService: CoverLetterAiService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
    @Inject(CoverLetterPdfService)
    private readonly pdfService: CoverLetterPdfService,
    @Inject(CoverLetterDocxService)
    private readonly docxService: CoverLetterDocxService,
  ) {}

  // Mesmo padrão do interview-prep: geração roda em background para não
  // ficar presa dentro do request (risco de timeout de proxy). Geração é
  // única por candidatura — se já existe carta com status != failed, ela é
  // apenas devolvida (idempotente), nunca regenerada automaticamente.
  async generateOrGet(
    userId: string,
    applicationId: string,
    input: GenerateCoverLetterInput,
  ) {
    const application = await this.database.jobApplication.findFirst({
      where: { id: applicationId, userId },
      include: {
        coverLetter: true,
        cvAdaptations: {
          where: { id: { not: undefined } },
          select: {
            id: true,
            status: true,
            isUnlocked: true,
            language: true,
            adaptedContentJson: true,
            aiAuditJson: true,
            editedCvJson: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    const existingLetter = application.coverLetter;
    if (existingLetter && existingLetter.status !== "failed") {
      this.logger.log(
        `[cover-letter] returning existing (status=${existingLetter.status}) — jobApplicationId=${applicationId} userId=${userId}`,
      );
      return existingLetter;
    }

    const resolvedAdaptationId =
      input.adaptationId ?? application.currentCvAdaptationId;

    if (!resolvedAdaptationId) {
      throw new ConflictException(
        "Defina o CV desta candidatura antes de gerar a carta de apresentação.",
      );
    }

    const currentAdaptation =
      application.cvAdaptations.find((cv) => cv.id === resolvedAdaptationId) ??
      null;

    if (!currentAdaptation) {
      throw new ConflictException(
        "Defina o CV desta candidatura antes de gerar a carta de apresentação.",
      );
    }

    if (!isAdaptationUnlocked(currentAdaptation)) {
      throw new ConflictException(
        "Libere o CV desta vaga para gerar a carta de apresentação.",
      );
    }

    // Idioma vem exclusivamente do valor já persistido na candidatura/CV —
    // nunca redetectado aqui. Ver feedback-kit-candidatura-artifact-isolation.
    const language =
      application.language ?? currentAdaptation.language ?? "pt-BR";
    if (!application.language && !currentAdaptation.language) {
      this.logger.warn(
        `[cover-letter] no persisted language for jobApplicationId=${applicationId} adaptationId=${resolvedAdaptationId} — falling back to pt-BR`,
      );
    }

    const cvSource = resolveCvJsonSource(currentAdaptation);
    const { professionalSummary, highlightedSkills } =
      resolveCvSummary(cvSource);
    const { candidateName } = resolveCvHeader(cvSource);
    const { remainingGaps, keywords } = resolveAnalysisGaps(currentAdaptation);

    const context: CoverLetterContext = {
      language,
      candidateName,
      professionalSummary,
      highlightedSkills,
      remainingGaps,
      keywords,
      jobTitle: application.jobTitle,
      companyName: application.companyName,
      style: input.style,
      lengthMode: input.lengthMode,
      maxCharacters: input.lengthMode === "custom" ? input.maxCharacters : null,
    };

    const letter = existingLetter
      ? await this.database.jobApplicationCoverLetter.update({
          where: { id: existingLetter.id },
          data: {
            status: "pending",
            style: input.style,
            lengthMode: input.lengthMode,
            maxCharacters: context.maxCharacters ?? null,
            cvAdaptationId: resolvedAdaptationId,
            lastError: null,
            generatedContentJson: Prisma.JsonNull,
            generatedAt: null,
            startedAt: null,
            finishedAt: null,
          },
        })
      : await this.database.jobApplicationCoverLetter.create({
          data: {
            jobApplicationId: applicationId,
            cvAdaptationId: resolvedAdaptationId,
            status: "pending",
            style: input.style,
            lengthMode: input.lengthMode,
            maxCharacters: context.maxCharacters ?? null,
          },
        });

    this.logger.log(
      `[cover-letter] queued — jobApplicationId=${applicationId} userId=${userId} letterId=${letter.id} style=${input.style} lengthMode=${input.lengthMode} language=${language}`,
    );

    this.processCoverLetterJob(letter.id, {
      applicationId,
      userId,
      context,
    }).catch((err) => {
      this.logger.error(
        `[cover-letter] ${letter.id} background processing crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return letter;
  }

  async getCoverLetter(userId: string, applicationId: string) {
    const application = await this.database.jobApplication.findFirst({
      where: { id: applicationId, userId },
      include: { coverLetter: true },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    return application.coverLetter;
  }

  async download(
    userId: string,
    applicationId: string,
    format: "pdf" | "docx",
    res: Response,
  ): Promise<void> {
    const application = await this.database.jobApplication.findFirst({
      where: { id: applicationId, userId },
      include: { coverLetter: true },
    });

    if (!application) {
      throw new NotFoundException("job application not found");
    }

    const letter = application.coverLetter;
    if (
      !letter ||
      letter.status !== "succeeded" ||
      !letter.generatedContentJson
    ) {
      throw new BadRequestException("cover letter is not ready yet");
    }

    const content =
      letter.generatedContentJson as unknown as CoverLetterContent;

    let candidateName = "";
    let contactLine = "";
    if (letter.cvAdaptationId) {
      const adaptation = await this.database.cvAdaptation.findUnique({
        where: { id: letter.cvAdaptationId },
        select: {
          editedCvJson: true,
          aiAuditJson: true,
          adaptedContentJson: true,
        },
      });
      if (adaptation) {
        const header = resolveCvHeader(resolveCvJsonSource(adaptation));
        candidateName = header.candidateName;
        contactLine = header.contactLine;
      }
    }

    const input = {
      body: content.body,
      jobTitle: application.jobTitle,
      companyName: application.companyName,
      candidateName,
      contactLine,
      generatedAt: letter.generatedAt ?? new Date(),
    };

    if (format === "docx") {
      const buffer = this.docxService.generateDocx(input);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=carta-de-apresentacao.docx",
      );
      res.send(buffer);
      return;
    }

    const buffer = await this.pdfService.generatePdf(input);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=carta-de-apresentacao.pdf",
    );
    res.send(buffer);
  }

  private async processCoverLetterJob(
    letterId: string,
    input: {
      applicationId: string;
      userId: string;
      context: CoverLetterContext;
    },
  ): Promise<void> {
    const { applicationId, userId, context } = input;

    await this.database.jobApplicationCoverLetter.update({
      where: { id: letterId },
      data: { status: "processing", startedAt: new Date() },
    });

    let content: CoverLetterContent;
    try {
      content = await this.aiService.generate(context);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI error";
      this.logger.error(
        `[cover-letter] generation failed — jobApplicationId=${applicationId} letterId=${letterId} error=${msg}`,
      );
      await this.database.jobApplicationCoverLetter.update({
        where: { id: letterId },
        data: { status: "failed", lastError: msg, finishedAt: new Date() },
      });
      return;
    }

    const result = await this.database.$transaction(async (tx) => {
      const updated = await tx.jobApplicationCoverLetter.update({
        where: { id: letterId },
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
          eventType: "COVER_LETTER_GENERATED",
          metadata: {
            style: context.style,
            lengthMode: context.lengthMode,
            characterCount: content.characterCount,
          },
        },
      });

      return updated;
    });

    this.logger.log(
      `[cover-letter] generated — jobApplicationId=${applicationId} letterId=${result.id}`,
    );

    if (!this.funnelEvents) {
      return;
    }

    await this.funnelEvents
      .record(
        {
          eventName: "cover_letter_generated",
          eventVersion: 1,
          idempotencyKey: `cover_letter_generated:${result.id}`,
          metadata: {
            style: context.style,
            length_mode: context.lengthMode,
            character_count: content.characterCount,
          },
        },
        {
          correlationId: `cover-letter:${applicationId}`,
          ip: null,
          requestId: `cover-letter:${result.id}`,
          routePath: "/api/job-applications/:id/cover-letter",
          sessionInternalId: null,
          sessionPublicToken: null,
          userAgentHash: null,
          userId,
        },
        "backend",
      )
      .catch((err: unknown) => {
        this.logger.warn(
          `[cover-letter] failed to record cover_letter_generated: ${err}`,
        );
      });
  }
}
