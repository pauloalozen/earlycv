import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import type { ProtectedAnalysisBlockedResult } from "../analysis-protection/analysis-protection.facade";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { DatabaseService } from "../database/database.service";

import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import { CvAdaptationDocxService } from "./cv-adaptation-docx.service";
import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";
import {
  CvAdaptationPdfService,
  type TemplateStructureJson,
} from "./cv-adaptation-pdf.service";
import { CvAdaptationProtectedAnalyzeService } from "./cv-adaptation-protected-analyze.service";
import type { AnalyzeCvDto } from "./dto/analyze-cv.dto";
import type { ClaimGuestAdaptationDto } from "./dto/claim-guest-adaptation.dto";
import type {
  CreateCvAdaptationDto,
  FileUpload,
} from "./dto/create-cv-adaptation.dto";
import type { CvAdaptationOutput } from "./dto/cv-adaptation-output.types";
import { createCvAdaptationResponseDto } from "./dto/cv-adaptation-response.dto";
import type { SaveGuestPreviewDto } from "./dto/save-guest-preview.dto";

@Injectable()
export class CvAdaptationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CvAdaptationAiService)
    private readonly aiService: CvAdaptationAiService,
    @Inject(CvAdaptationPaymentService)
    private readonly paymentService: CvAdaptationPaymentService,
    @Inject(CvAdaptationPdfService)
    private readonly pdfService: CvAdaptationPdfService,
    @Inject(CvAdaptationDocxService)
    private readonly docxService: CvAdaptationDocxService,
    @Inject(CvAdaptationProtectedAnalyzeService)
    private readonly protectedAnalyzeService: CvAdaptationProtectedAnalyzeService,
  ) {}

  async create(userId: string, dto: CreateCvAdaptationDto, file?: FileUpload) {
    let masterResumeId = dto.masterResumeId;
    let masterCvText: string | null = null;

    // Handle file upload path
    if (file) {
      // Extract text from PDF
      try {
        const { extractTextFromPdf } = await import("@earlycv/ai");
        masterCvText = await extractTextFromPdf(file.buffer);
      } catch (error) {
        throw new BadRequestException(
          `Failed to extract text from PDF: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }

      // Create master Resume record
      const masterResume = await this.database.$transaction(async (tx) => {
        if (dto.saveAsMaster) {
          await tx.resume.updateMany({
            where: { userId, isMaster: true },
            data: { isMaster: false },
          });
        }
        return tx.resume.create({
          data: {
            userId,
            title: file.originalname.replace(".pdf", ""),
            kind: "master",
            status: "uploaded",
            sourceFileName: file.originalname,
            sourceFileType: "application/pdf",
            rawText: masterCvText,
            isMaster: dto.saveAsMaster === true,
          },
        });
      });

      masterResumeId = masterResume.id;
    }

    // Require masterResumeId
    if (!masterResumeId) {
      throw new BadRequestException("masterResumeId or PDF file is required.");
    }

    // Verify masterResumeId ownership and get rawText
    const resume = await this.database.resume.findFirst({
      where: {
        id: masterResumeId,
        userId,
      },
    });

    if (!resume) {
      throw new NotFoundException("master resume not found");
    }

    if (!resume.rawText) {
      throw new BadRequestException(
        "master resume has no extracted text. Please re-upload.",
      );
    }

    // Use extracted text from file or from resume
    if (!masterCvText) {
      masterCvText = resume.rawText;
    }

    // Verify template exists if provided
    if (dto.templateId) {
      const template = await this.database.resumeTemplate.findUnique({
        where: { id: dto.templateId },
      });

      if (!template) {
        throw new NotFoundException("template not found");
      }
    }

    const adaptation = await this.database.cvAdaptation.create({
      data: {
        userId,
        masterResumeId,
        templateId: dto.templateId || null,
        jobDescriptionText: dto.jobDescriptionText,
        jobTitle: dto.jobTitle || null,
        companyName: dto.companyName || null,
        status: "analyzing",
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    this.protectedAnalyzeService
      .executeProtectedAnalyzeAndPersist({
        adaptation,
        context: this.buildProtectionContext(
          undefined,
          userId,
          "cv-adaptation/create",
        ),
        masterCvText,
        payload: {
          adaptationId: adaptation.id,
          companyName: adaptation.companyName,
          hasFile: Boolean(file),
          jobDescriptionText: adaptation.jobDescriptionText,
          jobTitle: adaptation.jobTitle,
          masterResumeId,
          route: "cv-adaptation/create",
          templateId: adaptation.templateId,
          userId,
        },
        turnstileToken: dto.turnstileToken,
      })
      .then(async (result) => {
        if (result.ok) {
          return;
        }

        await this.database.cvAdaptation.update({
          where: { id: adaptation.id },
          data: {
            status: "failed",
            failureReason: this.toProtectedBoundaryMessage(result),
          },
        });
      })
      .catch((err) => {
        console.error(
          `AI adaptation failed for ${adaptation.id}:`,
          err instanceof Error ? err.message : String(err),
        );

        this.database.cvAdaptation
          .update({
            where: { id: adaptation.id },
            data: {
              status: "failed",
              failureReason:
                err instanceof Error ? err.message : "Unknown AI error",
            },
          })
          .catch((updateError) => {
            console.error(
              `Failed to persist adaptation failure for ${adaptation.id}:`,
              updateError instanceof Error
                ? updateError.message
                : String(updateError),
            );
          });
      });

    return createCvAdaptationResponseDto(adaptation);
  }

  async claimGuest(userId: string, dto: ClaimGuestAdaptationDto) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { creditsRemaining: true, internalRole: true },
    });

    const hasUnlimitedClaims = user?.internalRole === "superadmin";

    if (!user || (!hasUnlimitedClaims && user.creditsRemaining < 1)) {
      throw new BadRequestException(
        "Você não tem créditos disponíveis para resgatar esta análise.",
      );
    }

    const defaultTemplate = await this.getDefaultTemplate();

    const adaptation = await this.database.$transaction(async (tx) => {
      const existingMaster = await tx.resume.findFirst({
        where: { userId, isMaster: true },
        select: { id: true },
      });

      let masterResumeId: string;
      if (existingMaster) {
        masterResumeId = existingMaster.id;
      } else {
        const created = await tx.resume.create({
          data: {
            userId,
            title: dto.jobTitle ? `CV para ${dto.jobTitle}` : "CV Importado",
            kind: "master",
            status: "uploaded",
            sourceFileType: "application/pdf",
            rawText: dto.masterCvText,
            isMaster: true,
          },
        });
        masterResumeId = created.id;
      }

      const created = await tx.cvAdaptation.create({
        data: {
          userId,
          masterResumeId,
          jobDescriptionText: dto.jobDescriptionText,
          templateId: defaultTemplate?.id ?? null,
          jobTitle: dto.jobTitle ?? null,
          companyName: dto.companyName ?? null,
          adaptedContentJson: dto.adaptedContentJson as Prisma.InputJsonValue,
          // aiAuditJson is generated lazily via ensureLegacyStructuredOutput on download
          previewText: dto.previewText ?? null,
          status: "delivered",
          paymentStatus: "completed",
          paidAt: new Date(),
        },
        include: {
          template: { select: { id: true, name: true, slug: true } },
        },
      });

      const adaptedResume = await tx.resume.create({
        data: {
          userId,
          title: dto.jobTitle ? `${dto.jobTitle} - Adaptado` : "CV Adaptado",
          kind: "adapted",
          isMaster: false,
          status: "reviewed",
          basedOnResumeId: masterResumeId,
          sourceFileName: "cv-adaptado.pdf",
          sourceFileType: "application/pdf",
          rawText: dto.previewText ?? "CV adaptado",
        },
      });

      const linked = await tx.cvAdaptation.update({
        where: { id: created.id },
        data: { adaptedResumeId: adaptedResume.id },
        include: {
          template: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!hasUnlimitedClaims) {
        await tx.user.update({
          where: { id: userId },
          data: { creditsRemaining: { decrement: 1 } },
        });
      }

      return linked;
    });

    return createCvAdaptationResponseDto(adaptation);
  }

  async analyzeGuest(
    jobDescriptionText: string,
    file?: FileUpload,
    turnstileToken?: string,
    analysisContext?: AnalysisRequestContext,
  ): Promise<{
    adaptedContentJson: unknown;
    previewText: string;
    masterCvText: string;
  }> {
    if (!file) {
      throw new BadRequestException("PDF file is required.");
    }

    const protectionResult =
      await this.protectedAnalyzeService.executeProtectedAnalyze({
        context: this.buildProtectionContext(
          analysisContext,
          null,
          "cv-adaptation/analyze-guest",
        ),
        jobDescriptionText,
        loadMasterCvText: async () => {
          try {
            const { extractTextFromPdf } = await import("@earlycv/ai");
            return await extractTextFromPdf(file.buffer);
          } catch (error) {
            throw new BadRequestException(
              `Failed to extract text from PDF: ${error instanceof Error ? error.message : "unknown error"}`,
            );
          }
        },
        payload: {
          cvFingerprint: this.buildFileFingerprint(file.buffer),
          hasFile: true,
          jobDescriptionText,
          route: "cv-adaptation/analyze-guest",
        },
        turnstileToken,
      });

    if (!protectionResult.ok) {
      throw new BadRequestException(
        this.toProtectedBoundaryMessage(protectionResult),
      );
    }

    return protectionResult.result;
  }

  async analyzeAuthenticated(
    userId: string,
    dto: AnalyzeCvDto,
    file?: FileUpload,
    analysisContext?: AnalysisRequestContext,
  ): Promise<{
    adaptedContentJson: unknown;
    previewText: string;
    masterCvText: string;
  }> {
    const protectionResult =
      await this.protectedAnalyzeService.executeProtectedAnalyze({
        context: this.buildProtectionContext(
          analysisContext,
          userId,
          "cv-adaptation/analyze",
        ),
        jobDescriptionText: dto.jobDescriptionText,
        loadMasterCvText: async () => {
          if (file) {
            let masterCvText: string;

            try {
              const { extractTextFromPdf } = await import("@earlycv/ai");
              masterCvText = await extractTextFromPdf(file.buffer);
            } catch (error) {
              throw new BadRequestException(
                `Failed to extract text from PDF: ${error instanceof Error ? error.message : "unknown error"}`,
              );
            }

            if (dto.saveAsMaster) {
              await this.database.$transaction(async (tx) => {
                await tx.resume.updateMany({
                  where: { userId, isMaster: true },
                  data: { isMaster: false },
                });
                await tx.resume.create({
                  data: {
                    userId,
                    title: file.originalname.replace(/\.[^.]+$/, ""),
                    kind: "master",
                    status: "uploaded",
                    sourceFileName: file.originalname,
                    sourceFileType: file.mimetype,
                    rawText: masterCvText,
                    isMaster: true,
                  },
                });
              });
            }

            return masterCvText;
          }

          if (dto.masterResumeId) {
            const resume = await this.database.resume.findFirst({
              where: { id: dto.masterResumeId, userId },
              select: { rawText: true },
            });

            if (!resume) {
              throw new BadRequestException("Resume not found.");
            }

            if (!resume.rawText?.trim()) {
              throw new BadRequestException("Resume has no text content.");
            }

            return resume.rawText;
          }

          throw new BadRequestException(
            "masterResumeId or PDF file is required.",
          );
        },
        payload: {
          cvFingerprint: file ? this.buildFileFingerprint(file.buffer) : null,
          hasFile: Boolean(file),
          jobDescriptionText: dto.jobDescriptionText,
          masterResumeId: dto.masterResumeId ?? null,
          route: "cv-adaptation/analyze",
          saveAsMaster: dto.saveAsMaster === true,
          userId,
        },
        turnstileToken: dto.turnstileToken,
      });

    if (!protectionResult.ok) {
      throw new BadRequestException(
        this.toProtectedBoundaryMessage(protectionResult),
      );
    }

    return protectionResult.result;
  }

  private buildProtectionContext(
    context: AnalysisRequestContext | undefined,
    userId: string | null,
    routeKey: string,
  ): AnalysisRequestContext & { routeKey: string } {
    return {
      correlationId: context?.correlationId ?? randomUUID(),
      ip: context?.ip ?? null,
      requestId: context?.requestId ?? randomUUID(),
      routeKey,
      routePath: context?.routePath ?? null,
      sessionInternalId: context?.sessionInternalId ?? null,
      sessionPublicToken: context?.sessionPublicToken ?? null,
      userAgentHash: context?.userAgentHash ?? null,
      userId: userId ?? context?.userId ?? null,
    };
  }

  private toProtectedBoundaryMessage(result: ProtectedAnalysisBlockedResult) {
    if (result.reason.startsWith("turnstile_")) {
      return "Turnstile verification failed";
    }

    return result.message;
  }

  private buildFileFingerprint(fileBuffer: Buffer): string {
    return createHash("sha256").update(fileBuffer).digest("hex");
  }

  async saveGuestPreview(userId: string, dto: SaveGuestPreviewDto) {
    const defaultTemplate = await this.getDefaultTemplate();

    const existingMaster = await this.database.resume.findFirst({
      where: { userId, isMaster: true },
      select: { id: true },
    });

    let masterResumeId: string;
    if (existingMaster) {
      masterResumeId = existingMaster.id;
    } else {
      const created = await this.database.resume.create({
        data: {
          userId,
          title: dto.jobTitle ? `CV para ${dto.jobTitle}` : "CV Importado",
          kind: "master",
          status: "uploaded",
          sourceFileType: "application/pdf",
          rawText: dto.masterCvText,
          isMaster: true,
        },
      });
      masterResumeId = created.id;
    }

    const adaptation = await this.database.cvAdaptation.create({
      data: {
        userId,
        masterResumeId,
        jobDescriptionText: dto.jobDescriptionText,
        templateId: defaultTemplate?.id ?? null,
        jobTitle: dto.jobTitle ?? null,
        companyName: dto.companyName ?? null,
        adaptedContentJson: dto.adaptedContentJson as Prisma.InputJsonValue,
        previewText: dto.previewText ?? null,
        status: "awaiting_payment",
        paymentStatus: "none",
      },
      include: {
        template: { select: { id: true, name: true, slug: true } },
      },
    });

    return createCvAdaptationResponseDto(adaptation);
  }

  async list(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.database.cvAdaptation.findMany({
        where: { userId },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.database.cvAdaptation.count({
        where: { userId },
      }),
    ]);

    return {
      items: items.map((a) => createCvAdaptationResponseDto(a)),
      total,
    };
  }

  async getById(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    return createCvAdaptationResponseDto(adaptation);
  }

  async delete(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    // Delete adapted resume if it exists
    if (adaptation.adaptedResumeId) {
      await this.database.resume.delete({
        where: { id: adaptation.adaptedResumeId },
      });
    }

    // Delete adaptation record
    await this.database.cvAdaptation.delete({
      where: { id },
    });
  }

  async createCheckout(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.status !== "awaiting_payment") {
      throw new BadRequestException(
        `Adaptation must be in awaiting_payment status. Current status: ${adaptation.status}`,
      );
    }

    const intent = await this.paymentService.createIntent(
      adaptation.id,
      userId,
    );

    // Store payment reference and set status to pending
    await this.database.cvAdaptation.update({
      where: { id },
      data: {
        paymentStatus: "pending",
        paymentReference: intent.paymentReference,
        paymentAmountInCents: intent.amountInCents,
        paymentCurrency: intent.currency,
      },
    });

    return {
      checkoutUrl: intent.checkoutUrl,
      paymentReference: intent.paymentReference,
      amountInCents: intent.amountInCents,
      currency: intent.currency,
    };
  }

  async confirmPayment(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.status === "delivered") {
      return createCvAdaptationResponseDto(
        await this.database.cvAdaptation.findUniqueOrThrow({
          where: { id },
          include: {
            template: { select: { id: true, name: true, slug: true } },
          },
        }),
      );
    }

    if (adaptation.status !== "awaiting_payment") {
      throw new BadRequestException(
        `Cannot confirm payment. Current status: ${adaptation.status}`,
      );
    }

    if (!adaptation.paymentReference) {
      throw new BadRequestException(
        "No payment reference found for this adaptation.",
      );
    }

    const approved = await this.paymentService.checkPaymentApprovedByReference(
      adaptation.paymentReference,
    );

    if (!approved) {
      throw new BadRequestException("Payment not approved yet.");
    }

    await this.database.cvAdaptation.update({
      where: { id },
      data: {
        paymentStatus: "completed",
        paidAt: new Date(),
        status: "paid",
      },
    });

    this.deliverAdaptation(id).catch((err) => {
      console.error(
        `Delivery failed for adaptation ${id}:`,
        err instanceof Error ? err.message : String(err),
      );
    });

    const updated = await this.database.cvAdaptation.findUniqueOrThrow({
      where: { id },
      include: { template: { select: { id: true, name: true, slug: true } } },
    });

    return createCvAdaptationResponseDto(updated);
  }

  async redeemWithCredit(userId: string, id: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { creditsRemaining: true, internalRole: true },
    });

    if (!user) {
      throw new NotFoundException("user not found");
    }

    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
      include: { template: { select: { id: true, name: true, slug: true } } },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.paymentStatus === "completed") {
      return createCvAdaptationResponseDto(adaptation);
    }

    if (!adaptation.adaptedContentJson) {
      throw new BadRequestException("Adaptation analysis is not ready yet.");
    }

    const hasUnlimitedClaims = user.internalRole === "superadmin";

    if (!hasUnlimitedClaims && user.creditsRemaining < 1) {
      throw new BadRequestException("Você não tem créditos disponíveis.");
    }

    const updated = await this.database.$transaction(async (tx) => {
      if (!hasUnlimitedClaims) {
        await tx.user.update({
          where: { id: userId },
          data: { creditsRemaining: { decrement: 1 } },
        });
      }

      return tx.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          paymentStatus: "completed",
          paidAt: new Date(),
          status:
            adaptation.status === "analyzing"
              ? "awaiting_payment"
              : adaptation.status,
        },
        include: { template: { select: { id: true, name: true, slug: true } } },
      });
    });

    return createCvAdaptationResponseDto(updated);
  }

  async handleWebhook(provider: string, body: unknown) {
    const paymentReference = await this.paymentService.resolvePaymentReference(
      provider,
      body,
    );

    if (!paymentReference) {
      return { acknowledged: true };
    }

    // Find adaptation by payment reference
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { paymentReference },
    });

    if (!adaptation) {
      console.warn(
        `Webhook received for unknown payment reference: ${paymentReference}`,
      );
      return { acknowledged: true };
    }

    // Update status to completed
    await this.database.cvAdaptation.update({
      where: { id: adaptation.id },
      data: {
        paymentStatus: "completed",
        paidAt: new Date(),
        status: "paid",
      },
    });

    // Trigger delivery pipeline (generate PDF, create adapted Resume)
    this.deliverAdaptation(adaptation.id).catch((err) => {
      console.error(
        `Delivery failed for adaptation ${adaptation.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    });

    return { acknowledged: true };
  }

  async downloadPdf(userId: string, id: string, res: Response): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
      include: {
        masterResume: { select: { title: true, rawText: true } },
        template: {
          select: { slug: true, structureJson: true, fileUrl: true },
        },
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.paymentStatus !== "completed") {
      throw new BadRequestException(
        `Adaptation must be paid to download. Status: ${adaptation.paymentStatus}`,
      );
    }

    await this.ensureAdaptedResumeRecord(adaptation);

    const generatedOutput = await this.ensureLegacyStructuredOutput(adaptation);

    const templateData = (
      adaptation as {
        template?: {
          slug?: string;
          structureJson?: unknown;
          fileUrl?: string | null;
        } | null;
      }
    ).template;

    const templateFileUrl = templateData?.fileUrl ?? null;
    const fallbackTemplate =
      templateFileUrl?.endsWith(".docx") || templateData?.structureJson
        ? null
        : await this.getDefaultTemplate();
    const resolvedTemplateFileUrl =
      templateFileUrl ?? fallbackTemplate?.fileUrl ?? null;
    const resolvedTemplateSlug =
      templateData?.slug ?? fallbackTemplate?.slug ?? "classico-simples";
    const resolvedStructureJson = (templateData?.structureJson ??
      fallbackTemplate?.structureJson ??
      null) as TemplateStructureJson | null;
    const output = this.toCvAdaptationOutput(
      adaptation.adaptedContentJson,
      generatedOutput ?? adaptation.aiAuditJson,
    );

    let pdfBuffer: Buffer;

    if (resolvedTemplateFileUrl?.endsWith(".docx")) {
      // DOCX template: fill with docxtemplater → convert via LibreOffice
      const docxBuffer = await this.docxService.generateDocx(
        output,
        resolvedTemplateFileUrl,
      );
      pdfBuffer = await this.docxService.toPdf(docxBuffer);
    } else {
      // Legacy HTML template or no template
      pdfBuffer = await this.pdfService.generatePdf(
        output,
        resolvedStructureJson ?? resolvedTemplateSlug,
      );
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=cv-adaptado.pdf",
    );
    res.send(pdfBuffer);
  }

  async downloadDocx(userId: string, id: string, res: Response): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
      include: {
        masterResume: { select: { title: true, rawText: true } },
        template: { select: { slug: true, fileUrl: true } },
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.paymentStatus !== "completed") {
      throw new BadRequestException(
        `Adaptation must be paid to download. Status: ${adaptation.paymentStatus}`,
      );
    }

    await this.ensureAdaptedResumeRecord(adaptation);

    const generatedOutput = await this.ensureLegacyStructuredOutput(adaptation);

    const templateFileUrl = (
      adaptation as {
        template?: { slug?: string; fileUrl?: string | null } | null;
      }
    ).template?.fileUrl;
    const fallbackTemplate = templateFileUrl?.endsWith(".docx")
      ? null
      : await this.getDefaultTemplate();

    const docxBuffer = await this.docxService.generateDocx(
      this.toCvAdaptationOutput(
        adaptation.adaptedContentJson,
        generatedOutput ?? adaptation.aiAuditJson,
      ),
      templateFileUrl ?? fallbackTemplate?.fileUrl ?? null,
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=cv-adaptado.docx",
    );
    res.send(docxBuffer);
  }

  async getContent(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (!adaptation.adaptedContentJson) {
      throw new BadRequestException("Adaptation analysis is not ready yet.");
    }

    const aiAudit = adaptation.aiAuditJson as Record<string, unknown> | null;
    const adaptationNotes =
      typeof aiAudit?.adaptationNotes === "string"
        ? aiAudit.adaptationNotes
        : null;

    return {
      adaptedContentJson: adaptation.adaptedContentJson,
      paymentStatus: adaptation.paymentStatus,
      status: adaptation.status,
      jobTitle: adaptation.jobTitle,
      companyName: adaptation.companyName,
      adaptationNotes,
      jobAnalysisCount: await this.countByJob(
        adaptation.jobTitle,
        adaptation.companyName,
      ),
    };
  }

  private async deliverAdaptation(adaptationId: string): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findUnique({
      where: { id: adaptationId },
      include: { masterResume: true, template: true },
    });

    if (!adaptation?.adaptedContentJson) {
      throw new Error("Adaptation not found or has no content");
    }

    const output = adaptation.adaptedContentJson as CvAdaptationOutput;
    const templateSlug = adaptation.template?.slug ?? "classico-simples";
    const structureJson = (adaptation.template?.structureJson ??
      null) as TemplateStructureJson | null;

    // Validate PDF generates correctly (do not save — generated on-demand at download)
    await this.pdfService.generatePdf(output, structureJson ?? templateSlug);

    // Create adapted Resume record
    const adaptedResume = await this.database.resume.create({
      data: {
        userId: adaptation.userId,
        title: `${adaptation.masterResume.title} - Adaptado`,
        kind: "adapted",
        isMaster: false,
        status: "reviewed",
        basedOnResumeId: adaptation.masterResumeId,
        templateId: adaptation.templateId,
        sourceFileName: "cv-adaptado.pdf",
        sourceFileType: "application/pdf",
        rawText: `Adapted CV for: ${adaptation.jobTitle || "unknown job"}`,
      },
    });

    await this.database.cvAdaptation.update({
      where: { id: adaptationId },
      data: {
        adaptedResumeId: adaptedResume.id,
        status: "delivered",
      },
    });

    // Pre-generate aiAuditJson (structured CV output) in background so
    // adaptationNotes is available immediately when the user views results
    if (!adaptation.aiAuditJson) {
      this.ensureLegacyStructuredOutput(adaptation).catch((err) => {
        console.error(
          `Background CV generation failed for ${adaptationId}:`,
          err instanceof Error ? err.message : String(err),
        );
      });
    }
  }

  private async ensureAdaptedResumeRecord(adaptation: {
    id: string;
    userId: string;
    masterResumeId: string;
    adaptedResumeId: string | null;
    masterResume: { title: string };
    jobTitle: string | null;
  }) {
    if (adaptation.adaptedResumeId) {
      return adaptation.adaptedResumeId;
    }

    const adaptedResume = await this.database.resume.create({
      data: {
        userId: adaptation.userId,
        title: `${adaptation.masterResume.title} - Adaptado`,
        kind: "adapted",
        isMaster: false,
        status: "reviewed",
        basedOnResumeId: adaptation.masterResumeId,
        sourceFileName: "cv-adaptado.pdf",
        sourceFileType: "application/pdf",
        rawText: `Adapted CV for: ${adaptation.jobTitle || "unknown job"}`,
      },
    });

    await this.database.cvAdaptation.update({
      where: { id: adaptation.id },
      data: { adaptedResumeId: adaptedResume.id },
    });

    return adaptedResume.id;
  }

  private async ensureLegacyStructuredOutput(adaptation: {
    id: string;
    adaptedContentJson: unknown;
    aiAuditJson: unknown;
    jobDescriptionText: string;
    jobTitle: string | null;
    companyName: string | null;
    userId: string;
    masterResume: { rawText: string | null };
  }): Promise<CvAdaptationOutput | null> {
    if (
      adaptation.aiAuditJson &&
      typeof adaptation.aiAuditJson === "object" &&
      "summary" in adaptation.aiAuditJson &&
      "sections" in adaptation.aiAuditJson
    ) {
      return adaptation.aiAuditJson as CvAdaptationOutput;
    }

    const masterCvText =
      adaptation.masterResume.rawText?.trim() ||
      this.synthesizeMasterCvTextFromGuestAnalysis(
        adaptation.adaptedContentJson,
      );

    if (!masterCvText) return null;

    try {
      const protectionResult =
        await this.protectedAnalyzeService.executeProtectedBuildPaidCvOutputFromGuest(
          {
            companyName: adaptation.companyName ?? undefined,
            context: this.buildProtectionContext(
              undefined,
              adaptation.userId,
              "cv-adaptation/internal-paid-output",
            ),
            jobDescriptionText: adaptation.jobDescriptionText,
            jobTitle: adaptation.jobTitle ?? undefined,
            masterCvText,
            payload: {
              adaptationId: adaptation.id,
              companyName: adaptation.companyName,
              jobDescriptionText: adaptation.jobDescriptionText,
              jobTitle: adaptation.jobTitle,
              route: "cv-adaptation/internal-paid-output",
              userId: adaptation.userId,
            },
          },
        );

      if (!protectionResult.ok) {
        return null;
      }

      const output = protectionResult.result;

      await this.database.cvAdaptation.update({
        where: { id: adaptation.id },
        data: { aiAuditJson: output as unknown as Prisma.InputJsonValue },
      });

      return output;
    } catch {
      return null;
    }
  }

  private synthesizeMasterCvTextFromGuestAnalysis(
    adaptedContentJson: unknown,
  ): string {
    const guest = adaptedContentJson as {
      fit?: { headline?: string; subheadline?: string };
      comparacao?: { antes?: string; depois?: string };
      pontos_fortes?: string[];
      melhorias_aplicadas?: string[];
      lacunas?: string[];
      ats_keywords?: { presentes?: string[] };
      preview?: { antes?: string; depois?: string };
    };

    const lines: string[] = [];

    if (guest.fit?.headline) lines.push(guest.fit.headline);
    if (guest.fit?.subheadline) lines.push(guest.fit.subheadline);
    if (guest.comparacao?.depois) lines.push(guest.comparacao.depois);
    if (guest.preview?.depois) lines.push(guest.preview.depois);

    if (guest.pontos_fortes?.length) {
      lines.push("Pontos fortes:");
      lines.push(...guest.pontos_fortes.map((item) => `- ${item}`));
    }

    if (guest.melhorias_aplicadas?.length) {
      lines.push("Melhorias aplicadas:");
      lines.push(...guest.melhorias_aplicadas.map((item) => `- ${item}`));
    }

    if (guest.lacunas?.length) {
      lines.push("Lacunas:");
      lines.push(...guest.lacunas.map((item) => `- ${item}`));
    }

    if (guest.ats_keywords?.presentes?.length) {
      lines.push("Palavras-chave presentes:");
      lines.push(...guest.ats_keywords.presentes.map((item) => `- ${item}`));
    }

    return lines.join("\n").trim();
  }

  private async getDefaultTemplate(): Promise<{
    id: string;
    slug: string;
    fileUrl: string | null;
    structureJson: unknown;
  } | null> {
    return this.database.resumeTemplate.findFirst({
      where: { slug: "classico-simples", isActive: true },
      select: {
        id: true,
        slug: true,
        fileUrl: true,
        structureJson: true,
      },
    });
  }

  private filterEmptySections(output: CvAdaptationOutput): CvAdaptationOutput {
    const itemHasContent = (
      item: {
        heading?: string;
        subheading?: string;
        dateRange?: string;
        bullets?: string[];
      },
      sectionTitle: string,
    ) =>
      (Array.isArray(item.bullets) &&
        item.bullets.some(
          (b) => typeof b === "string" && b.trim().length > 0,
        )) ||
      (typeof item.subheading === "string" &&
        item.subheading.trim().length > 0) ||
      (typeof item.dateRange === "string" &&
        item.dateRange.trim().length > 0) ||
      (typeof item.heading === "string" &&
        item.heading.trim().length > 0 &&
        item.heading.trim().toLowerCase() !==
          sectionTitle.trim().toLowerCase());

    return {
      ...output,
      sections: (output.sections ?? []).filter(
        (s) =>
          Array.isArray(s.items) &&
          s.items.length > 0 &&
          s.items.some((item) => itemHasContent(item, s.title)),
      ),
    };
  }

  private toCvAdaptationOutput(
    adaptedContentJson: unknown,
    aiAuditJson?: unknown,
  ): CvAdaptationOutput {
    if (
      aiAuditJson &&
      typeof aiAuditJson === "object" &&
      "summary" in aiAuditJson &&
      "sections" in aiAuditJson
    ) {
      return this.filterEmptySections(aiAuditJson as CvAdaptationOutput);
    }

    if (
      adaptedContentJson &&
      typeof adaptedContentJson === "object" &&
      "summary" in adaptedContentJson &&
      "sections" in adaptedContentJson
    ) {
      return this.filterEmptySections(adaptedContentJson as CvAdaptationOutput);
    }

    const guest = adaptedContentJson as {
      fit?: { headline?: string; subheadline?: string };
      pontos_fortes?: string[];
      melhorias_aplicadas?: string[];
      lacunas?: string[];
      ats_keywords?: { presentes?: string[]; ausentes?: string[] };
    };

    const summary = [guest.fit?.headline, guest.fit?.subheadline]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(". ");

    const strengths = guest.pontos_fortes ?? [];
    const improvements = guest.melhorias_aplicadas ?? [];
    const gaps = guest.lacunas ?? [];

    return {
      summary: summary || "CV adaptado para esta vaga.",
      sections: [
        {
          sectionType: "other",
          title: "Pontos fortes",
          items: [
            {
              heading: "Destaques",
              bullets:
                strengths.length > 0 ? strengths : ["Sem destaques informados"],
            },
          ],
        },
        {
          sectionType: "other",
          title: "Melhorias aplicadas",
          items: [
            {
              heading: "Ajustes realizados",
              bullets:
                improvements.length > 0
                  ? improvements
                  : ["Sem melhorias aplicadas informadas"],
            },
          ],
        },
        {
          sectionType: "other",
          title: "Lacunas e proximos passos",
          items: [
            {
              heading: "Pontos de atencao",
              bullets: gaps.length > 0 ? gaps : ["Sem lacunas identificadas"],
            },
          ],
        },
      ],
      highlightedSkills: guest.ats_keywords?.presentes ?? [],
      removedSections: guest.ats_keywords?.ausentes ?? [],
    };
  }

  async countByJob(
    jobTitle: string | null,
    companyName: string | null,
  ): Promise<number> {
    if (!jobTitle && !companyName) return 0;
    return this.database.cvAdaptation.count({
      where: {
        ...(jobTitle && {
          jobTitle: { equals: jobTitle, mode: "insensitive" },
        }),
        ...(companyName && {
          companyName: { equals: companyName, mode: "insensitive" },
        }),
        status: { not: "failed" },
      },
    });
  }
}
