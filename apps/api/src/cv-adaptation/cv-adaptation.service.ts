import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import type { ProtectedAnalysisBlockedResult } from "../analysis-protection/analysis-protection.facade";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { extractTextFromCvFile } from "../common/cv-text-extractor";
import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";

import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import { CvAdaptationDocxService } from "./cv-adaptation-docx.service";
import {
  CvAdaptationPaymentService,
  type WebhookPaymentResolution,
} from "./cv-adaptation-payment.service";
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
import type { RedeemCreditDto } from "./dto/redeem-credit.dto";
import type { SaveGuestPreviewDto } from "./dto/save-guest-preview.dto";

type AuditEntry = {
  eventType: string;
  actionTaken: string;
  mpPaymentId?: string | null;
  mpMerchantOrderId?: string | null;
  mpPreferenceId?: string | null;
  externalReference?: string | null;
  internalCheckoutId?: string | null;
  internalCheckoutType?: string;
  mpStatus?: string | null;
  errorMessage?: string | null;
  rawPayload?: object | null;
};

@Injectable()
export class CvAdaptationService {
  private readonly logger = new Logger(CvAdaptationService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CvAdaptationAiService) readonly _aiService: CvAdaptationAiService,
    @Inject(CvAdaptationPaymentService)
    private readonly paymentService: CvAdaptationPaymentService,
    @Inject(CvAdaptationPdfService)
    private readonly pdfService: CvAdaptationPdfService,
    @Inject(CvAdaptationDocxService)
    private readonly docxService: CvAdaptationDocxService,
    @Inject(CvAdaptationProtectedAnalyzeService)
    private readonly protectedAnalyzeService: CvAdaptationProtectedAnalyzeService,
    @Inject(StorageService)
    private readonly storage: Pick<
      StorageService,
      "deleteObject" | "getObject" | "putObject"
    > = {
      async deleteObject() {
        return;
      },
      async getObject() {
        return Buffer.alloc(0);
      },
      async putObject() {
        return "";
      },
    },
  ) {}

  async create(userId: string, dto: CreateCvAdaptationDto, file?: FileUpload) {
    this.validateJobDescription(dto.jobDescriptionText);

    let masterResumeId = dto.masterResumeId;
    let masterCvText: string | null = null;

    // Handle file upload path
    if (file) {
      // Extract text from PDF
      try {
        masterCvText = await extractTextFromCvFile(file);
      } catch (error) {
        this.mapFileExtractionError(error);
      }

      const sourceFileUrl = await this.uploadResumeSourceFile(userId, file);

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
            sourceFileType: file.mimetype,
            sourceFileUrl,
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
              failureReason: this.sanitizeFailureReason(err),
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

  async claimGuest(
    userId: string,
    dto: ClaimGuestAdaptationDto,
    analysisContext?: AnalysisRequestContext,
  ) {
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
    const guestSessionHash = this.hashGuestSessionToken(
      dto.guestSessionPublicToken ?? analysisContext?.sessionPublicToken,
    );

    const adaptation = await this.database.$transaction(async (tx) => {
      const existingMaster = await tx.resume.findFirst({
        where: { userId, isMaster: true, kind: "master" },
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
            isMaster: false,
          },
        });
        masterResumeId = created.id;
      }

      const adaptedContent = this.withFrozenMissingKeywords(
        dto.adaptedContentJson,
        dto.selectedMissingKeywords,
      );

      const snapshot = await this.validateAndClaimSnapshot({
        tx,
        snapshotId: dto.analysisCvSnapshotId,
        userId,
        guestSessionHash,
      });

      const releaseDate = this.getSnapshotEnforcementReleaseDate();
      if (!snapshot && new Date() >= releaseDate) {
        throw new BadRequestException(
          "Analysis snapshot is required to claim this adaptation.",
        );
      }

      const created = await tx.cvAdaptation.create({
        data: {
          userId,
          masterResumeId,
          jobDescriptionText: dto.jobDescriptionText,
          templateId: defaultTemplate?.id ?? null,
          jobTitle: dto.jobTitle ?? null,
          companyName: dto.companyName ?? null,
          adaptedContentJson: adaptedContent as Prisma.InputJsonValue,
          // aiAuditJson is generated lazily via ensureLegacyStructuredOutput on download
          previewText: dto.previewText ?? null,
          analysisCvSnapshotId: snapshot?.id ?? null,
          status: "delivered",
          isUnlocked: true,
          unlockedAt: new Date(),
        },
        include: {
          template: { select: { id: true, name: true, slug: true } },
          analysisCvSnapshot: {
            select: { sourceType: true, originalFileStorageKey: true },
          },
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
          analysisCvSnapshot: {
            select: { sourceType: true, originalFileStorageKey: true },
          },
        },
      });

      if (!hasUnlimitedClaims) {
        await tx.user.update({
          where: { id: userId },
          data: { creditsRemaining: { decrement: 1 } },
        });
      }

      await tx.cvUnlock.create({
        data: {
          userId,
          cvAdaptationId: linked.id,
          creditsConsumed: hasUnlimitedClaims ? 0 : 1,
          source: hasUnlimitedClaims ? "ADMIN" : "CREDIT",
          status: "UNLOCKED",
          unlockedAt: new Date(),
        },
      });

      return linked;
    });

    return createCvAdaptationResponseDto(adaptation);
  }

  async analyzeGuest(
    jobDescriptionText: string,
    file?: FileUpload,
    masterCvText?: string,
    turnstileToken?: string,
    analysisContext?: AnalysisRequestContext,
  ): Promise<{
    adaptedContentJson: unknown;
    previewText: string;
    masterCvText: string;
    analysisCvSnapshotId: string;
    guestSessionPublicToken: string | null;
  }> {
    this.validateJobDescription(jobDescriptionText);

    const normalizedMasterCvText =
      typeof masterCvText === "string"
        ? this.normalizeSnapshotText(masterCvText)
        : "";
    const hasTextInput = normalizedMasterCvText.length > 0;
    let resolvedMasterCvText: string | null = null;

    if (!file && !hasTextInput) {
      throw new BadRequestException("PDF file or CV text is required.");
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
          if (resolvedMasterCvText) {
            return resolvedMasterCvText;
          }

          if (hasTextInput) {
            resolvedMasterCvText = normalizedMasterCvText;
            return resolvedMasterCvText;
          }

          if (!file) {
            throw new BadRequestException("PDF file or CV text is required.");
          }

          try {
            resolvedMasterCvText = this.normalizeSnapshotText(
              await extractTextFromCvFile(file),
            );
            return resolvedMasterCvText;
          } catch (error) {
            this.mapFileExtractionError(error);
          }
        },
        payload: {
          cvFingerprint: file ? this.buildFileFingerprint(file.buffer) : null,
          hasFile: Boolean(file),
          jobDescriptionText,
          hasTextInput,
          route: "cv-adaptation/analyze-guest",
        },
        turnstileToken,
      });

    if (!protectionResult.ok) {
      throw new BadRequestException(
        this.toProtectedBoundaryMessage(protectionResult),
      );
    }

    const finalMasterCvText =
      resolvedMasterCvText ??
      this.normalizeSnapshotText(protectionResult.result.masterCvText);
    const snapshot = await this.createAnalysisCvSnapshot({
      sourceType: hasTextInput ? "text_input" : "uploaded_file",
      text: finalMasterCvText,
      guestSessionHash: this.hashGuestSessionToken(
        analysisContext?.sessionPublicToken,
      ),
      file,
      userId: null,
    });

    return {
      ...protectionResult.result,
      masterCvText: finalMasterCvText,
      analysisCvSnapshotId: snapshot.id,
      guestSessionPublicToken: analysisContext?.sessionPublicToken ?? null,
    };
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
    analysisCvSnapshotId: string;
  }> {
    this.validateJobDescription(dto.jobDescriptionText);
    const hasTextInput = Boolean(dto.masterCvText?.trim());
    let sourceType: "text_input" | "uploaded_file" | "master_resume" =
      "master_resume";
    let resolvedMasterCvText: string | null = null;

    const protectionResult =
      await this.protectedAnalyzeService.executeProtectedAnalyze({
        context: this.buildProtectionContext(
          analysisContext,
          userId,
          "cv-adaptation/analyze",
        ),
        jobDescriptionText: dto.jobDescriptionText,
        loadMasterCvText: async () => {
          if (resolvedMasterCvText) {
            return resolvedMasterCvText;
          }

          if (dto.masterCvText?.trim()) {
            sourceType = "text_input";
            resolvedMasterCvText = this.normalizeSnapshotText(dto.masterCvText);
            return resolvedMasterCvText;
          }

          if (file) {
            let masterCvText: string;
            sourceType = "uploaded_file";

            try {
              masterCvText = await extractTextFromCvFile(file);
            } catch (error) {
              this.mapFileExtractionError(error);
            }

            if (dto.saveAsMaster) {
              const sourceFileUrl = await this.uploadResumeSourceFile(
                userId,
                file,
              );

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
                    sourceFileUrl,
                    rawText: masterCvText,
                    isMaster: true,
                  },
                });
              });
            }

            resolvedMasterCvText = this.normalizeSnapshotText(masterCvText);
            return resolvedMasterCvText;
          }

          if (dto.masterResumeId) {
            sourceType = "master_resume";
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

            resolvedMasterCvText = this.normalizeSnapshotText(resume.rawText);
            return resolvedMasterCvText;
          }

          throw new BadRequestException(
            "masterResumeId, PDF file or CV text is required.",
          );
        },
        payload: {
          cvFingerprint: file ? this.buildFileFingerprint(file.buffer) : null,
          hasFile: Boolean(file),
          hasTextInput,
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

    const finalMasterCvText =
      resolvedMasterCvText ??
      this.normalizeSnapshotText(protectionResult.result.masterCvText);
    const snapshot = await this.createAnalysisCvSnapshot({
      sourceType,
      text: finalMasterCvText,
      guestSessionHash: null,
      file,
      userId,
    });

    return {
      ...protectionResult.result,
      masterCvText: finalMasterCvText,
      analysisCvSnapshotId: snapshot.id,
    };
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

  async saveGuestPreview(
    userId: string,
    dto: SaveGuestPreviewDto,
    file?: FileUpload,
    analysisContext?: AnalysisRequestContext,
  ) {
    const defaultTemplate = await this.getDefaultTemplate();
    const guestSessionHash = this.hashGuestSessionToken(
      dto.guestSessionPublicToken ?? analysisContext?.sessionPublicToken,
    );

    const existingMaster = await this.database.resume.findFirst({
      where: { userId, isMaster: true, kind: "master" },
      select: { id: true },
    });

    let masterResumeId: string;

    if (file) {
      const sourceFileUrl = await this.uploadResumeSourceFile(userId, file);

      const created = await this.database.$transaction(async (tx) => {
        if (dto.saveAsMaster) {
          await tx.resume.updateMany({
            where: { userId, isMaster: true },
            data: { isMaster: false },
          });
        }

        return tx.resume.create({
          data: {
            userId,
            title: file.originalname.replace(/\.[^.]+$/, ""),
            kind: "master",
            status: "uploaded",
            sourceFileName: file.originalname,
            sourceFileType: file.mimetype,
            sourceFileUrl,
            rawText: dto.masterCvText,
            isMaster: dto.saveAsMaster === true,
          },
        });
      });

      masterResumeId = created.id;
    } else if (existingMaster) {
      masterResumeId = existingMaster.id;
    } else {
      const created = await this.database.resume.create({
        data: {
          userId,
          title: dto.jobTitle ? `CV para ${dto.jobTitle}` : "CV Importado",
          kind: "master",
          status: "uploaded",
          sourceFileType: null,
          rawText: dto.masterCvText,
          isMaster: false,
        },
      });

      masterResumeId = created.id;
    }

    const snapshot = await this.validateAndClaimSnapshot({
      tx: this.database,
      snapshotId: dto.analysisCvSnapshotId,
      userId,
      guestSessionHash,
    });

    const releaseDate = this.getSnapshotEnforcementReleaseDate();
    if (!snapshot && new Date() >= releaseDate) {
      throw new BadRequestException(
        "Analysis snapshot is required to persist this adaptation.",
      );
    }

    const existingAdaptation = await this.database.cvAdaptation.findFirst({
      where: {
        userId,
        analysisCvSnapshotId: snapshot?.id ?? null,
      },
      include: {
        template: { select: { id: true, name: true, slug: true } },
        analysisCvSnapshot: {
          select: { sourceType: true, originalFileStorageKey: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingAdaptation) {
      return createCvAdaptationResponseDto(existingAdaptation);
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
        analysisCvSnapshotId: snapshot?.id ?? null,
        status: "pending",
        paymentStatus: "none",
      },
      include: {
        template: { select: { id: true, name: true, slug: true } },
        analysisCvSnapshot: {
          select: { sourceType: true, originalFileStorageKey: true },
        },
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
          analysisCvSnapshot: {
            select: { sourceType: true, originalFileStorageKey: true },
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

  async cleanupExpiredGuestSnapshots(now = new Date()) {
    const expired = await this.database.analysisCvSnapshot.findMany({
      where: {
        userId: null,
        expiresAt: { lte: now },
        cvAdaptation: { is: null },
      },
      select: {
        id: true,
        textStorageKey: true,
        originalFileStorageKey: true,
      },
      take: 200,
      orderBy: { expiresAt: "asc" },
    });

    for (const snapshot of expired) {
      await this.storage
        .deleteObject(snapshot.textStorageKey)
        .catch(() => null);
      if (snapshot.originalFileStorageKey) {
        await this.storage
          .deleteObject(snapshot.originalFileStorageKey)
          .catch(() => null);
      }
    }

    if (expired.length === 0) {
      return { deleted: 0 };
    }

    const deleted = await this.database.analysisCvSnapshot.deleteMany({
      where: {
        id: { in: expired.map((snapshot: { id: string }) => snapshot.id) },
      },
    });

    return { deleted: deleted.count };
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
        analysisCvSnapshot: {
          select: { sourceType: true, originalFileStorageKey: true },
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

    if (adaptation.paymentStatus === "completed") {
      throw new BadRequestException(
        "Pagamento já confirmado para esta análise.",
      );
    }

    // If a paymentReference already exists (pending), reuse it to avoid orphaning
    // a payment made on a previously generated MP preference.
    const existingReference =
      adaptation.paymentStatus === "pending" && adaptation.paymentReference
        ? adaptation.paymentReference
        : null;

    const intent = await this.paymentService.createIntent(
      adaptation.id,
      userId,
      existingReference ?? undefined,
    );

    await this.database.cvAdaptation.update({
      where: { id },
      data: {
        paymentStatus: "pending",
        paymentReference: intent.paymentReference,
        paymentAmountInCents: intent.amountInCents,
        paymentCurrency: intent.currency,
        ...(intent.mpPreferenceId
          ? { mpPreferenceId: intent.mpPreferenceId }
          : {}),
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
      include: { template: { select: { id: true, name: true, slug: true } } },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    // Webhook already confirmed — return success
    if (adaptation.isUnlocked) {
      return createCvAdaptationResponseDto(adaptation);
    }

    if (adaptation.paymentStatus === "failed") {
      throw new BadRequestException("Pagamento recusado. Tente novamente.");
    }

    // Not yet confirmed by webhook — frontend must poll the status endpoint
    throw new BadRequestException(
      "Pagamento ainda não confirmado. Aguarde a confirmação.",
    );
  }

  async redeemWithCredit(userId: string, id: string, dto?: RedeemCreditDto) {
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

    const existingUnlock = await this.database.cvUnlock.findUnique({
      where: { cvAdaptationId: adaptation.id },
    });

    if (existingUnlock?.status === "UNLOCKED") {
      return createCvAdaptationResponseDto(adaptation);
    }

    if (adaptation.isUnlocked) {
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
      const currentUnlock = await tx.cvUnlock.findUnique({
        where: { cvAdaptationId: adaptation.id },
      });

      if (currentUnlock?.status === "UNLOCKED") {
        const currentAdaptation = await tx.cvAdaptation.findUnique({
          where: { id: adaptation.id },
          include: {
            template: { select: { id: true, name: true, slug: true } },
          },
        });
        if (!currentAdaptation) {
          throw new NotFoundException("adaptation not found");
        }
        return currentAdaptation;
      }

      if (!hasUnlimitedClaims) {
        await tx.user.update({
          where: { id: userId },
          data: { creditsRemaining: { decrement: 1 } },
        });
      }

      const updatedContent = this.withFrozenMissingKeywords(
        adaptation.adaptedContentJson,
        dto?.selectedMissingKeywords,
      );

      const nextAdaptation = await tx.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          status: "paid",
          isUnlocked: true,
          unlockedAt: new Date(),
          adaptedContentJson: updatedContent as Prisma.InputJsonValue,
        },
        include: { template: { select: { id: true, name: true, slug: true } } },
      });

      await tx.cvUnlock.create({
        data: {
          userId,
          cvAdaptationId: adaptation.id,
          creditsConsumed: hasUnlimitedClaims ? 0 : 1,
          source: hasUnlimitedClaims ? "ADMIN" : "CREDIT",
          status: "UNLOCKED",
          unlockedAt: new Date(),
        },
      });

      return nextAdaptation;
    });

    this.deliverAdaptation(adaptation.id).catch((err) => {
      this.logger.error(
        `[redeem-credit] delivery failed for ${adaptation.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return createCvAdaptationResponseDto(updated);
  }

  private withFrozenMissingKeywords(
    adaptedContentJson: unknown,
    selectedMissingKeywords?: string[],
  ) {
    if (
      !selectedMissingKeywords?.length ||
      typeof adaptedContentJson !== "object"
    ) {
      return adaptedContentJson;
    }

    const sanitized = selectedMissingKeywords
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0)
      .slice(0, 80);

    return {
      ...(adaptedContentJson as Record<string, unknown>),
      selectedMissingKeywords: sanitized,
    };
  }

  async reconcileAdaptation(adaptationId: string): Promise<boolean> {
    const adaptation = await this.database.cvAdaptation.findUnique({
      where: { id: adaptationId },
    });

    if (!adaptation || adaptation.paymentStatus === "completed") return false;

    await this.database.$transaction(async (tx) => {
      const current = await tx.cvAdaptation.findUnique({
        where: { id: adaptationId },
      });
      if (!current || current.paymentStatus === "completed") return;

      await tx.cvAdaptation.update({
        where: { id: adaptationId },
        data: {
          paymentStatus: "completed",
          paidAt: new Date(),
          status: "paid",
          isUnlocked: true,
          unlockedAt: new Date(),
        },
      });

      await tx.cvUnlock.upsert({
        where: { cvAdaptationId: adaptationId },
        update: {
          status: "UNLOCKED",
          source: "PLAN_ENTITLEMENT",
          unlockedAt: new Date(),
        },
        create: {
          userId: current.userId,
          cvAdaptationId: adaptationId,
          creditsConsumed: 0,
          source: "PLAN_ENTITLEMENT",
          status: "UNLOCKED",
          unlockedAt: new Date(),
        },
      });
    });

    this.logAuditEvent({
      eventType: "reconciliation_approved",
      actionTaken: "approved",
      internalCheckoutId: adaptationId,
      internalCheckoutType: "adaptation",
    });

    if (!adaptation.adaptedResumeId) {
      this.deliverAdaptation(adaptationId).catch((err) => {
        this.logger.error(
          `[reconcile] delivery failed for ${adaptationId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    return true;
  }

  verifyWebhookSignature(
    provider: string,
    body: unknown,
    xSignature?: string,
    xRequestId?: string,
  ): void {
    if (provider !== "mercadopago") return;

    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!secret) return; // dev: sem secret configurado, aceita sem validar

    if (!xSignature) {
      throw new UnauthorizedException("Missing webhook signature");
    }

    const parts: Record<string, string> = {};
    for (const part of xSignature.split(",")) {
      const [k, v] = part.split("=");
      if (k && v) parts[k.trim()] = v.trim();
    }
    const ts = parts.ts;
    const v1 = parts.v1;

    if (!ts || !v1) {
      throw new UnauthorizedException("Invalid webhook signature format");
    }

    const dataId =
      body !== null &&
      typeof body === "object" &&
      "data" in body &&
      body.data !== null &&
      typeof body.data === "object" &&
      "id" in body.data
        ? String((body.data as { id: unknown }).id)
        : "";

    const message = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;
    const expected = createHmac("sha256", secret).update(message).digest("hex");

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(v1);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  async handleWebhook(provider: string, body: unknown) {
    this.logger.log(`[webhook:cv-adaptation] received`);

    let resolution: WebhookPaymentResolution;
    try {
      resolution = await this.paymentService.resolveWebhookPayment(
        provider,
        body,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[webhook:cv-adaptation] error resolving payment: ${msg}`,
      );
      this.logAuditEvent({
        eventType: "unexpected_error",
        actionTaken: "error",
        errorMessage: msg,
        rawPayload: body as object,
      });
      return { acknowledged: true };
    }

    if (!resolution.paymentReference) {
      this.logger.log(`[webhook:cv-adaptation] ignored — no payment reference`);
      this.logAuditEvent({
        eventType: "webhook_received",
        actionTaken: "ignored",
        mpPaymentId: resolution.paymentId,
        mpStatus: resolution.rawStatus,
        rawPayload: body as object,
      });
      return { acknowledged: true };
    }

    const auditBase = {
      mpPaymentId: resolution.paymentId,
      mpMerchantOrderId: resolution.merchantOrderId,
      mpPreferenceId: resolution.preferenceId,
      externalReference: resolution.paymentReference,
      internalCheckoutType: "adaptation",
      mpStatus: resolution.rawStatus,
      rawPayload: body as object,
    };

    if (resolution.status === "failed") {
      const adaptation = await this.database.cvAdaptation.findFirst({
        where: { paymentReference: resolution.paymentReference },
      });

      if (
        adaptation &&
        adaptation.paymentStatus !== "completed" &&
        adaptation.paymentStatus !== "failed"
      ) {
        await this.database.cvAdaptation.update({
          where: { id: adaptation.id },
          data: {
            paymentStatus: "failed",
            ...(!adaptation.mpPaymentId && resolution.paymentId
              ? { mpPaymentId: resolution.paymentId }
              : {}),
          },
        });
      }

      this.logAuditEvent({
        ...auditBase,
        eventType: "payment_rejected",
        actionTaken: "failed",
        internalCheckoutId: adaptation?.id ?? null,
      });
      return { acknowledged: true };
    }

    if (resolution.status !== "approved") {
      this.logger.log(
        `[webhook:cv-adaptation] ignored — status is ${resolution.rawStatus}`,
      );
      const adaptation = await this.database.cvAdaptation.findFirst({
        where: { paymentReference: resolution.paymentReference },
      });
      this.logAuditEvent({
        ...auditBase,
        eventType: "payment_pending",
        actionTaken: "pending",
        internalCheckoutId: adaptation?.id ?? null,
      });
      return { acknowledged: true };
    }

    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { paymentReference: resolution.paymentReference },
    });

    if (!adaptation) {
      this.logger.warn(
        `[webhook:cv-adaptation] unknown paymentReference: ${resolution.paymentReference}`,
      );
      this.logAuditEvent({
        ...auditBase,
        eventType: "webhook_received",
        actionTaken: "ignored",
        errorMessage: "adaptation not found for paymentReference",
      });
      return { acknowledged: true };
    }

    if (adaptation.paymentStatus === "completed") {
      this.logger.log(
        `[webhook:cv-adaptation] already processed — adaptation ${adaptation.id}`,
      );
      this.logAuditEvent({
        ...auditBase,
        eventType: "webhook_duplicated",
        actionTaken: "duplicated",
        internalCheckoutId: adaptation.id,
      });
      return { acknowledged: true };
    }

    // Atomic: re-check inside transaction to prevent double-credit on concurrent webhooks
    await this.database.$transaction(async (tx) => {
      const current = await tx.cvAdaptation.findUnique({
        where: { id: adaptation.id },
      });
      if (!current || current.paymentStatus === "completed") return;

      await tx.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          paymentStatus: "completed",
          paidAt: new Date(),
          status: "paid",
          isUnlocked: true,
          unlockedAt: new Date(),
          ...(!current.mpPaymentId && resolution.paymentId
            ? { mpPaymentId: resolution.paymentId }
            : {}),
          ...(!current.mpMerchantOrderId && resolution.merchantOrderId
            ? { mpMerchantOrderId: resolution.merchantOrderId }
            : {}),
        },
      });

      await tx.cvUnlock.upsert({
        where: { cvAdaptationId: adaptation.id },
        update: {
          status: "UNLOCKED",
          source: "PLAN_ENTITLEMENT",
          unlockedAt: new Date(),
        },
        create: {
          userId: current.userId,
          cvAdaptationId: adaptation.id,
          creditsConsumed: 0,
          source: "PLAN_ENTITLEMENT",
          status: "UNLOCKED",
          unlockedAt: new Date(),
        },
      });
    });

    this.logger.log(
      `[webhook:cv-adaptation] payment approved — adaptation ${adaptation.id}`,
    );
    this.logAuditEvent({
      ...auditBase,
      eventType: "payment_approved",
      actionTaken: "approved",
      internalCheckoutId: adaptation.id,
    });

    this.deliverAdaptation(adaptation.id).catch((err) => {
      this.logger.error(
        `[webhook:cv-adaptation] delivery failed for ${adaptation.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return { acknowledged: true };
  }

  private logAuditEvent(entry: AuditEntry): void {
    this.database.paymentAuditLog
      .create({
        data: {
          provider: "mercadopago",
          eventType: entry.eventType,
          actionTaken: entry.actionTaken,
          mpPaymentId: entry.mpPaymentId ?? null,
          mpMerchantOrderId: entry.mpMerchantOrderId ?? null,
          mpPreferenceId: entry.mpPreferenceId ?? null,
          externalReference: entry.externalReference ?? null,
          internalCheckoutId: entry.internalCheckoutId ?? null,
          internalCheckoutType: entry.internalCheckoutType ?? null,
          mpStatus: entry.mpStatus ?? null,
          errorMessage: entry.errorMessage ?? null,
          ...(entry.rawPayload != null
            ? { rawPayload: entry.rawPayload as Prisma.InputJsonValue }
            : {}),
        },
      })
      .catch((err: unknown) => {
        this.logger.error(`[audit] write failed: ${err}`);
      });
  }

  private isAdaptationUnlocked(
    isUnlocked: boolean,
    cvUnlock?: { status: "UNLOCKED" | "REVOKED" } | null,
  ): boolean {
    return isUnlocked || cvUnlock?.status === "UNLOCKED";
  }

  async downloadPdf(userId: string, id: string, res: Response): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
      include: {
        masterResume: { select: { title: true, rawText: true } },
        cvUnlock: { select: { status: true } },
        template: {
          select: { slug: true, structureJson: true, fileUrl: true },
        },
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (
      !this.isAdaptationUnlocked(adaptation.isUnlocked, adaptation.cvUnlock)
    ) {
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
        cvUnlock: { select: { status: true } },
        masterResume: { select: { title: true, rawText: true } },
        template: { select: { slug: true, fileUrl: true } },
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (
      !this.isAdaptationUnlocked(adaptation.isUnlocked, adaptation.cvUnlock)
    ) {
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

  async downloadBaseCv(
    userId: string,
    id: string,
    res: Response,
  ): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        analysisCvSnapshotId: true,
        createdAt: true,
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (!adaptation.analysisCvSnapshotId) {
      if (adaptation.createdAt >= this.getSnapshotEnforcementReleaseDate()) {
        throw new BadRequestException("Analysis snapshot is required.");
      }
      throw new BadRequestException(
        "Base CV unavailable for legacy adaptations.",
      );
    }

    const snapshot = await this.database.analysisCvSnapshot.findUnique({
      where: { id: adaptation.analysisCvSnapshotId },
      select: {
        textStorageKey: true,
        originalFileStorageKey: true,
        originalFileName: true,
        originalMimeType: true,
      },
    });

    if (!snapshot) {
      throw new NotFoundException("analysis snapshot not found");
    }

    if (snapshot.originalFileStorageKey) {
      const fileBuffer = await this.storage.getObject(
        snapshot.originalFileStorageKey,
      );
      const filename = snapshot.originalFileName || "cv-base";
      const mimeType = snapshot.originalMimeType || "application/octet-stream";
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.send(fileBuffer);
      return;
    }

    const markdownBuffer = await this.storage.getObject(
      snapshot.textStorageKey,
    );
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=cv-base-analise.md",
    );
    res.send(markdownBuffer);
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
      isUnlocked: adaptation.isUnlocked,
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
    createdAt: Date;
    analysisCvSnapshotId: string | null;
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

    const masterCvText = await this.resolveGenerationMasterCvText(adaptation);

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
            selectedMissingKeywords: this.getSelectedMissingKeywords(
              adaptation.adaptedContentJson,
            ),
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

  private getSelectedMissingKeywords(adaptedContentJson: unknown): string[] {
    if (!adaptedContentJson || typeof adaptedContentJson !== "object") {
      return [];
    }

    const raw = (adaptedContentJson as { selectedMissingKeywords?: unknown })
      .selectedMissingKeywords;

    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 80);
  }

  private async getDefaultTemplate(): Promise<{
    id: string;
    slug: string;
    fileUrl: string | null;
    structureJson: unknown;
  } | null> {
    return this.database.resumeTemplate.findFirst({
      where: {
        isActive: true,
        fileUrl: { not: null, endsWith: ".docx" },
      },
      orderBy: { slug: "asc" },
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

  private mapFileExtractionError(error: unknown): never {
    if (error instanceof Error) {
      if (error.name === "NotACvError") {
        this.logger.warn(
          "[cv-validation] uploaded file does not look like a CV",
        );
        throw new BadRequestException(
          "O arquivo enviado não parece ser um currículo. Envie um CV em PDF, DOCX, DOC ou ODT para análise.",
        );
      }
      if (error.name === "ScannedPdfError") {
        this.logger.warn(
          "[cv-validation] PDF has no extractable text (scanned/image)",
        );
        throw new BadRequestException(
          "Não conseguimos ler o texto do PDF. Envie um arquivo com texto selecionável.",
        );
      }
      this.logger.warn(
        `[cv-validation] file extraction failed: ${error.message}`,
      );
    }
    throw new BadRequestException(
      "Não foi possível ler o arquivo. Verifique se ele não está protegido por senha, corrompido ou em formato inválido.",
    );
  }

  private normalizeSnapshotText(input: string): string {
    return input
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .trim();
  }

  private hashGuestSessionToken(sessionPublicToken: string | null | undefined) {
    const token = sessionPublicToken?.trim();
    if (!token) return null;
    return createHash("sha256").update(token).digest("hex");
  }

  private getSnapshotEnforcementReleaseDate() {
    return new Date("2026-04-29T14:30:00.000Z");
  }

  private async createAnalysisCvSnapshot(input: {
    userId: string | null;
    guestSessionHash: string | null;
    sourceType: "text_input" | "uploaded_file" | "master_resume";
    text: string;
    file?: FileUpload;
  }) {
    const normalizedText = this.normalizeSnapshotText(input.text);
    const textBuffer = Buffer.from(normalizedText, "utf8");
    const textSha256 = createHash("sha256").update(textBuffer).digest("hex");
    const textStorageKey = `analysis-cv-snapshots/text/${randomUUID()}.md`;
    await this.storage.putObject(textStorageKey, textBuffer, "text/markdown");

    let originalFileStorageKey: string | null = null;
    let originalFileSha256: string | null = null;
    let originalFileName: string | null = null;
    let originalMimeType: string | null = null;
    let originalFileSizeBytes: number | null = null;

    if (input.file) {
      const extension = input.file.originalname.includes(".")
        ? (input.file.originalname.split(".").pop()?.toLowerCase() ?? "bin")
        : "bin";
      originalFileStorageKey = `analysis-cv-snapshots/original/${randomUUID()}-${this.sanitizeFileName(input.file.originalname)}.${extension}`;
      await this.storage.putObject(
        originalFileStorageKey,
        input.file.buffer,
        input.file.mimetype,
      );
      originalFileSha256 = this.buildFileFingerprint(input.file.buffer);
      originalFileName = input.file.originalname;
      originalMimeType = input.file.mimetype;
      originalFileSizeBytes = input.file.size;
    }

    const expiresAt = input.userId
      ? null
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return this.database.analysisCvSnapshot.create({
      data: {
        userId: input.userId,
        guestSessionHash: input.guestSessionHash,
        sourceType: input.sourceType,
        textStorageKey,
        textSha256,
        textSizeBytes: textBuffer.byteLength,
        originalFileStorageKey,
        originalFileSha256,
        originalFileName,
        originalMimeType,
        originalFileSizeBytes,
        expiresAt,
      },
    });
  }

  private async validateAndClaimSnapshot(input: {
    tx: {
      analysisCvSnapshot: {
        findUnique: (args: { where: { id: string } }) => Promise<{
          id: string;
          userId: string | null;
          guestSessionHash: string | null;
          expiresAt: Date | null;
          claimedAt: Date | null;
          claimedByUserId: string | null;
        } | null>;
        update: (args: {
          where: { id: string };
          data: {
            claimedAt: Date;
            claimedByUserId: string;
          };
        }) => Promise<{ id: string }>;
      };
    };
    snapshotId: string;
    userId: string;
    guestSessionHash: string | null;
  }) {
    const snapshot = await input.tx.analysisCvSnapshot.findUnique({
      where: { id: input.snapshotId },
    });

    if (!snapshot) {
      throw new BadRequestException("Analysis snapshot not found.");
    }

    if (snapshot.expiresAt && snapshot.expiresAt <= new Date()) {
      throw new BadRequestException("Analysis snapshot expired.");
    }

    if (snapshot.userId && snapshot.userId !== input.userId) {
      throw new UnauthorizedException("Snapshot does not belong to this user.");
    }

    if (!snapshot.userId) {
      if (snapshot.guestSessionHash) {
        if (
          !input.guestSessionHash ||
          snapshot.guestSessionHash !== input.guestSessionHash
        ) {
          throw new UnauthorizedException("Snapshot guest session mismatch.");
        }
      }

      if (
        snapshot.claimedByUserId &&
        snapshot.claimedByUserId !== input.userId
      ) {
        throw new BadRequestException("Analysis snapshot already claimed.");
      }

      return input.tx.analysisCvSnapshot.update({
        where: { id: snapshot.id },
        data: {
          claimedAt: snapshot.claimedAt ?? new Date(),
          claimedByUserId: snapshot.claimedByUserId ?? input.userId,
        },
      });
    }

    return snapshot;
  }

  private async resolveGenerationMasterCvText(adaptation: {
    id: string;
    adaptedContentJson: unknown;
    analysisCvSnapshotId: string | null;
    createdAt: Date;
    masterResume: { rawText: string | null };
  }): Promise<string | null> {
    if (adaptation.analysisCvSnapshotId) {
      const snapshot = await this.database.analysisCvSnapshot.findUnique({
        where: { id: adaptation.analysisCvSnapshotId },
        select: { textStorageKey: true },
      });
      if (!snapshot) {
        throw new BadRequestException(
          "Analysis snapshot not found for adaptation.",
        );
      }
      const buffer = await this.storage.getObject(snapshot.textStorageKey);
      return this.normalizeSnapshotText(buffer.toString("utf8"));
    }

    if (adaptation.createdAt >= this.getSnapshotEnforcementReleaseDate()) {
      throw new BadRequestException(
        "Adaptation has no analysis snapshot and cannot be generated.",
      );
    }

    return (
      adaptation.masterResume.rawText?.trim() ||
      this.synthesizeMasterCvTextFromGuestAnalysis(
        adaptation.adaptedContentJson,
      )
    );
  }

  private validateJobDescription(text: string): void {
    const JOB_MIN_CHARS = 80;
    const JOB_SIGNALS = [
      "requisitos",
      "responsabilidades",
      "vaga",
      "experiência",
      "experiencia",
      "habilidades",
      "perfil",
      "função",
      "funcao",
      "cargo",
      "empresa",
      "contratação",
      "contratacao",
      "candidato",
      "oportunidade",
      "buscamos",
      "procuramos",
      "requirements",
      "responsibilities",
      "job",
      "position",
      "skills",
      "role",
      "company",
      "hiring",
      "candidate",
    ];

    if (!text || text.trim().length < JOB_MIN_CHARS) {
      this.logger.warn("[cv-validation] job description too short");
      throw new BadRequestException(
        "O texto informado não parece uma descrição de vaga. Cole uma descrição válida para continuar.",
      );
    }

    const lower = text.toLowerCase();
    const hasSignal = JOB_SIGNALS.some((s) => lower.includes(s));
    if (!hasSignal) {
      this.logger.warn(
        "[cv-validation] job description does not look like a job posting",
      );
      throw new BadRequestException(
        "O texto informado não parece uma descrição de vaga. Cole uma descrição válida para continuar.",
      );
    }
  }

  private async uploadResumeSourceFile(userId: string, file: FileUpload) {
    const extension = file.originalname.includes(".")
      ? (file.originalname.split(".").pop()?.toLowerCase() ?? "bin")
      : "bin";
    const key = `resumes/${userId}/${randomUUID()}-${this.sanitizeFileName(file.originalname)}.${extension}`;
    return this.storage.putObject(key, file.buffer, file.mimetype);
  }

  private sanitizeFileName(fileName: string): string {
    const normalized = fileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    return normalized || "resume";
  }

  private sanitizeFailureReason(err: unknown): string {
    const raw = err instanceof Error ? err.message : "Unknown AI error";
    return raw.slice(0, 500);
  }
}
