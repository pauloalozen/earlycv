import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  AnalysisJobStatus as AnalysisJobStatusValue,
  JobApplicationOrigin,
  JobApplicationStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import type { ProductOrigin } from "../analysis-observability/product-origin";
import type { ProtectedAnalysisBlockedResult } from "../analysis-protection/analysis-protection.facade";
import { AnalysisTelemetryService } from "../analysis-protection/analysis-telemetry.service";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import {
  extractTextFromCvFile,
  validateCvFileEnvelope,
} from "../common/cv-text-extractor";
import {
  hashGuestPossessionToken,
  possessionTokenMatchesHash,
} from "../common/guest-possession-token";
import { CvMasterPromotionService } from "../cv-processing/cv-master-promotion.service";
import { isCvStructuredProfilePipelineEnabled } from "../cv-processing/cv-processing.flags";
import { CvProcessingEntrypointService } from "../cv-processing/cv-processing-entrypoint.service";
import { DatabaseService } from "../database/database.service";
import { JobApplicationsService } from "../job-applications/job-applications.service";
import { MasterCvCanonicalExtractionService } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.service";
import { sanitizePaymentAuditPayload } from "../payments/payment-audit-sanitization";
import type { CanonicalProfileData } from "../profiles/profile-canonical.types";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { StorageService } from "../storage/storage.service";
import { TalentProfileCaptureService } from "../talent-profiles/talent-profile-capture.service";
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
import type { JobRequirementCoverage } from "./dto/job-requirement.types";
import type { RedeemCreditDto } from "./dto/redeem-credit.dto";
import type { SaveApplicationIdentityDto } from "./dto/save-application-identity.dto";
import type { SaveGuestPreviewDto } from "./dto/save-guest-preview.dto";
import type { CanonicalJobLookupResult } from "./job-canonicalization.service";
import { JobCanonicalizationService } from "./job-canonicalization.service";
import { JobRequirementSetsService } from "./job-requirement-sets.service";

type JobApplicationHookInput = {
  cvAdaptationId: string;
  userId: string;
  jobTitle: string | null;
  companyName: string | null;
  jobDescriptionText: string | null;
  targetStatus: JobApplicationStatus;
  origin: JobApplicationOrigin;
  callerMethod: string;
  radarJobId?: string | null;
  // product_origin real da navegação até a vaga (radar/monitor/
  // monitor_email), quando disponível — ver AnalyzeCvDto.radarJobOrigin /
  // SaveGuestPreviewDto.radarJobOrigin. undefined quando o caller não tem
  // esse contexto (ex.: claimGuest, unlockCv — não vêm de uma vaga do
  // Radar/Alerta).
  radarJobOrigin?: "radar" | "monitor" | "monitor_email" | null;
  // Contexto de jornada da análise que originou esta candidatura automática
  // (quando disponível no caller — ex.: claimGuest/saveGuestPreview rodam
  // dentro do request original e têm analysisContext em mãos). Nunca
  // inventado: fica undefined quando o caller não tem o contexto.
  visitorId?: string | null;
  journeySessionInternalId?: string | null;
};

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

type ValidationTelemetry = {
  emit: AnalysisTelemetryService["emit"];
};

@Injectable()
export class CvAdaptationService {
  private readonly logger = new Logger(CvAdaptationService.name);
  // Prevents parallel LLM generation calls for the same adaptation
  private readonly cvGenerationInProgress = new Set<string>();

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
    @Inject(AnalysisTelemetryService)
    private readonly analysisTelemetry: ValidationTelemetry = {
      async emit() {
        return;
      },
    },
    @Inject(JobApplicationsService)
    private readonly jobApplicationsService: Pick<
      JobApplicationsService,
      "upsertFromCvAdaptation"
    > = {
      async upsertFromCvAdaptation() {
        return;
      },
    },
    @Inject(ProfileCanonicalMergeService)
    private readonly profileMergeService: Pick<
      ProfileCanonicalMergeService,
      "merge"
    > = {
      merge(input) {
        return {
          next: input.existing,
          fieldMeta: input.fieldMeta ?? {},
          suggestions: input.suggestions ?? [],
        };
      },
    },
    @Inject(ProfileReadinessService)
    private readonly profileReadinessService: Pick<
      ProfileReadinessService,
      "compute"
    > = {
      compute() {
        return "partial";
      },
    },
    @Optional()
    @Inject(JobCanonicalizationService)
    private readonly jobCanonicalizationService?: Pick<
      JobCanonicalizationService,
      "getOrCreateCanonicalJob"
    >,
    @Optional()
    @Inject(JobRequirementSetsService)
    private readonly jobRequirementSetsService?: Pick<
      JobRequirementSetsService,
      "findByRequirementSourceHash" | "getOrCreateFromAnalysis"
    >,
    @Optional()
    @Inject(TalentProfileCaptureService)
    private readonly talentProfileCapture: Pick<
      TalentProfileCaptureService,
      "captureFromSnapshot"
    > = {
      captureFromSnapshot() {
        return;
      },
    },
    @Optional()
    @Inject(MasterCvCanonicalExtractionService)
    private readonly masterCvCanonicalExtractionService?: Pick<
      MasterCvCanonicalExtractionService,
      "enqueueFromMasterResumeUpload"
    >,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: Pick<
      BusinessFunnelEventService,
      "record"
    > = {
      async record() {
        return { event: {}, ingested: false };
      },
    },
    // Fase 2C (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md):
    // usados só quando CV_STRUCTURED_PROFILE_PIPELINE_ENABLED=true, dentro
    // de startAuthenticatedAnalysisJobCanonical/resolveCanonicalMasterIntent.
    // Sempre @Optional — com a flag desligada (default), nunca são
    // referenciados, então nunca precisam existir (mantém os ~90 testes
    // legados de cv-adaptation.service.spec.ts intocados, já que são
    // parâmetros novos no final da lista, com default undefined).
    @Optional()
    @Inject(CvProcessingEntrypointService)
    private readonly cvProcessingEntrypoint?: Pick<
      CvProcessingEntrypointService,
      "enqueueFromUserText"
    >,
    @Optional()
    @Inject(CvMasterPromotionService)
    private readonly cvMasterPromotionForAnalysis?: Pick<
      CvMasterPromotionService,
      "getActiveDesignation"
    >,
  ) {}

  // Fire-and-forget: um CV que virou master durante uma análise (primeiro
  // CV do usuário, promovido automaticamente, ou explicitamente marcado
  // via dto.saveAsMaster) precisa passar pelo mesmo preenchimento de perfil
  // que o upload dedicado em /meu-cv-master já dispara — sem isso o Resume
  // fica marcado isMaster mas nunca populacionaliza UserProfile. Nunca deve
  // atrasar nem quebrar a análise em si.
  private triggerMasterCvExtraction(input: {
    userId: string;
    resumeId: string;
    rawText?: string | null;
    file?: FileUpload;
  }): void {
    if (!this.masterCvCanonicalExtractionService) return;
    this.masterCvCanonicalExtractionService
      .enqueueFromMasterResumeUpload({
        userId: input.userId,
        resumeId: input.resumeId,
        ...(input.rawText ? { rawText: input.rawText } : {}),
        ...(input.file
          ? {
              file: {
                buffer: input.file.buffer,
                originalname: input.file.originalname,
                mimetype: input.file.mimetype,
                size: input.file.size,
              },
            }
          : {}),
      })
      .catch((error) => {
        this.logger.error(
          `[master-cv-extraction] falha ao enfileirar pro resume ${input.resumeId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private async triggerJobApplicationHook(
    input: JobApplicationHookInput,
  ): Promise<void> {
    try {
      await this.jobApplicationsService.upsertFromCvAdaptation({
        userId: input.userId,
        cvAdaptationId: input.cvAdaptationId,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        jobDescriptionText: input.jobDescriptionText,
        targetStatus: input.targetStatus,
        origin: input.origin,
        radarJobId: input.radarJobId,
        radarJobOrigin: input.radarJobOrigin,
        visitorId: input.visitorId,
        journeySessionInternalId: input.journeySessionInternalId,
      });
    } catch (err) {
      this.logger.error(
        `[job-application-hook] failed in ${input.callerMethod} — adaptationId=${input.cvAdaptationId} userId=${input.userId} targetStatus=${input.targetStatus}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async create(userId: string, dto: CreateCvAdaptationDto, file?: FileUpload) {
    const normalizedJobDescriptionText = this.validateJobDescription(
      dto.jobDescriptionText,
      {
        context: this.buildProtectionContext(
          undefined,
          userId,
          "cv-adaptation/create",
        ),
        routeKey: "cv-adaptation/create",
      },
    );

    const inputMode = dto.inputMode ?? (file ? "file_upload" : "text_paste");
    const adaptationSource =
      inputMode === "profile" ? "user_profile" : "uploaded_content";

    if (inputMode === "profile" && file) {
      throw new BadRequestException(
        "Modo profile nao aceita upload de arquivo no mesmo envio.",
      );
    }

    if (inputMode === "profile") {
      const profile = await this.database.userProfile.findUnique({
        where: { userId },
        select: { profileReadinessStatus: true },
      });

      if (profile?.profileReadinessStatus !== "ready") {
        throw new BadRequestException(
          "Perfil salvo ainda nao esta pronto para analise no modo profile.",
        );
      }
    }

    let masterResumeId = dto.masterResumeId;
    let masterCvText: string | null = null;

    // Handle file upload path
    if (file) {
      // Extract text from PDF
      try {
        masterCvText = await extractTextFromCvFile(file);
      } catch (error) {
        await this.mapFileExtractionError(error, {
          context: this.buildProtectionContext(
            undefined,
            userId,
            "cv-adaptation/create",
          ),
          file,
          routeKey: "cv-adaptation/create",
        });
      }

      const sourceFileUrl = await this.uploadResumeSourceFile(userId, file);

      // Create master Resume record — primeiro CV do usuário vira master
      // automaticamente, sem precisar de dto.saveAsMaster (que só existe
      // pra decidir SUBSTITUIR um master já existente).
      const masterResume = await this.database.$transaction(async (tx) => {
        const existingResumeCount = await tx.resume.count({
          where: { userId },
        });
        const shouldBecomeMaster =
          existingResumeCount === 0 || dto.saveAsMaster === true;
        if (shouldBecomeMaster) {
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
            isMaster: shouldBecomeMaster,
          },
        });
      });

      masterResumeId = masterResume.id;
      if (masterResume.isMaster) {
        this.triggerMasterCvExtraction({
          userId,
          resumeId: masterResume.id,
          rawText: masterCvText,
          file,
        });
      }
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

    await this.mergeCanonicalProfileFromText({
      source: inputMode === "profile" ? "base_cv_upload" : "analysis_upload",
      sourceCvId: masterResumeId,
      text: masterCvText,
      userId,
    });

    const canonicalJob = await this.resolveCanonicalJob(
      normalizedJobDescriptionText,
      "create",
    );
    const existingRequirementSet =
      await this.resolveExistingRequirementSet(canonicalJob);
    const canonicalJobId = canonicalJob?.canonicalJobId ?? null;

    // Validate that the supplied jobApplicationId belongs to this user
    let linkedJobApplicationId: string | null = null;
    if (dto.jobApplicationId) {
      const owned = await this.database.jobApplication.findFirst({
        where: { id: dto.jobApplicationId, userId },
        select: { id: true },
      });
      if (owned) {
        linkedJobApplicationId = owned.id;
      }
    }

    const adaptation = await this.database.cvAdaptation.create({
      data: {
        userId,
        masterResumeId,
        templateId: dto.templateId || null,
        canonicalJobId,
        jobRequirementSetId: existingRequirementSet?.id ?? null,
        jobDescriptionText: normalizedJobDescriptionText,
        jobTitle: dto.jobTitle || null,
        companyName: dto.companyName || null,
        adaptationSource,
        inputMode,
        jobApplicationId: linkedJobApplicationId,
        analysisInputSnapshotJson: this.buildAnalysisInputSnapshot({
          adaptationSource,
          inputMode,
          masterCvText,
          masterResumeId,
        }) as Prisma.InputJsonValue,
        uploadedContentSnapshotJson:
          adaptationSource === "uploaded_content"
            ? (this.buildUploadedContentSnapshot({
                inputMode,
                masterCvText,
                masterResumeId,
              }) as Prisma.InputJsonValue)
            : undefined,
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
          jobDescriptionText: normalizedJobDescriptionText,
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
          await this.triggerJobApplicationHook({
            cvAdaptationId: adaptation.id,
            userId,
            jobTitle: adaptation.jobTitle,
            companyName: adaptation.companyName,
            jobDescriptionText: adaptation.jobDescriptionText,
            targetStatus: "ANALYZED",
            origin: "analysis_auto",
            callerMethod: "create",
          });
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
    const canonicalJob = await this.resolveCanonicalJob(
      dto.jobDescriptionText,
      "claimGuest",
    );
    const canonicalJobId = canonicalJob?.canonicalJobId ?? null;
    const existingRequirementSet =
      await this.resolveExistingRequirementSet(canonicalJob);
    const guestSessionHash = this.hashGuestSessionToken(
      dto.guestSessionPublicToken ?? analysisContext?.sessionPublicToken,
    );

    // Fora da transação: se ela criar um master novo (primeiro CV do
    // usuário — não existia nenhum master antes), dispara o preenchimento
    // de perfil depois que a análise em si já foi persistida.
    let newMasterResumeId: string | null = null;

    const adaptation = await this.database.$transaction(async (tx) => {
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

      const existingMaster = await tx.resume.findFirst({
        where: { userId, isMaster: true, kind: "master" },
        select: { id: true },
      });

      let masterResumeId: string;
      if (existingMaster) {
        masterResumeId = existingMaster.id;
      } else {
        // Sem master existente, este CV vira o primeiro master do usuário
        // automaticamente — sem perguntar nada. O título usa o nome do
        // arquivo que o usuário de fato enviou na análise (guardado no
        // snapshot), não um placeholder baseado na vaga.
        const originalFileName = snapshot?.originalFileName ?? null;
        const created = await tx.resume.create({
          data: {
            userId,
            title: originalFileName
              ? originalFileName.replace(/\.[^.]+$/, "")
              : dto.jobTitle
                ? `CV para ${dto.jobTitle}`
                : "CV Importado",
            sourceFileName: originalFileName ?? undefined,
            kind: "master",
            status: "uploaded",
            sourceFileType: "application/pdf",
            rawText: dto.masterCvText,
            isMaster: true,
          },
        });
        masterResumeId = created.id;
        newMasterResumeId = created.id;
      }

      const adaptedContent = this.reconcileVagaFields(
        this.withFrozenMissingKeywords(
          dto.adaptedContentJson,
          dto.selectedMissingKeywords,
        ),
        {
          jobTitle: dto.jobTitle ?? null,
          companyName: dto.companyName ?? null,
        },
      );

      const created = await tx.cvAdaptation.create({
        data: {
          userId,
          masterResumeId,
          jobDescriptionText: dto.jobDescriptionText,
          templateId: defaultTemplate?.id ?? null,
          canonicalJobId,
          jobRequirementSetId: existingRequirementSet?.id ?? null,
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
            select: {
              sourceType: true,
              originalFileStorageKey: true,
              originalFileName: true,
            },
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
            select: {
              sourceType: true,
              originalFileStorageKey: true,
              originalFileName: true,
            },
          },
          masterResume: {
            select: { rawText: true, title: true, sourceFileName: true },
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

    if (newMasterResumeId) {
      this.triggerMasterCvExtraction({
        userId,
        resumeId: newMasterResumeId,
        rawText: dto.masterCvText,
      });
    }

    await this.triggerJobApplicationHook({
      cvAdaptationId: adaptation.id,
      userId,
      jobTitle: dto.jobTitle ?? null,
      companyName: dto.companyName ?? null,
      jobDescriptionText: dto.jobDescriptionText,
      targetStatus: "CV_READY",
      origin: "optimized_cv_auto",
      callerMethod: "claimGuest",
      visitorId: analysisContext?.visitorId,
      journeySessionInternalId: analysisContext?.journeySessionInternalId,
    });

    // Generate aiAuditJson (structured CV sections) synchronously so
    // /adaptacao-cv has real content the moment the user navigates there,
    // instead of racing a background job against the frontend redirect.
    await this.ensureLegacyStructuredOutput({
      ...adaptation,
      masterResume: adaptation.masterResume ?? { rawText: null },
    }).catch((err) => {
      this.logger.error(
        `[claim-guest] CV generation failed for ${adaptation.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
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
    const normalizedJobDescriptionText = this.validateJobDescription(
      jobDescriptionText,
      {
        context: this.buildProtectionContext(
          analysisContext,
          null,
          "cv-adaptation/analyze-guest",
        ),
        routeKey: "cv-adaptation/analyze-guest",
      },
    );
    const canonicalJob = await this.resolveCanonicalJob(
      normalizedJobDescriptionText,
      "analyzeGuest",
    );
    const existingRequirementSet =
      await this.resolveExistingRequirementSet(canonicalJob);
    const effectiveRequirements = await this.resolveEffectiveRequirements(
      existingRequirementSet,
    );

    const normalizedMasterCvText =
      typeof masterCvText === "string"
        ? this.normalizeSnapshotText(masterCvText)
        : "";
    const hasTextInput = normalizedMasterCvText.length > 0;
    const shouldUseUploadedFile = !hasTextInput && Boolean(file);
    let resolvedMasterCvText: string | null = null;

    if (!file && !hasTextInput) {
      throw new BadRequestException("PDF file or CV text is required.");
    }

    if (shouldUseUploadedFile && file) {
      try {
        validateCvFileEnvelope(file);
      } catch (error) {
        await this.mapFileExtractionError(error, {
          context: this.buildProtectionContext(
            analysisContext,
            null,
            "cv-adaptation/analyze-guest",
          ),
          file,
          routeKey: "cv-adaptation/analyze-guest",
        });
      }

      await this.recordFunnelEvent(
        "cv_upload_completed",
        this.buildProtectionContext(
          analysisContext,
          null,
          "cv-adaptation/analyze-guest",
        ),
        "cv-adaptation/analyze-guest",
        `cv_upload_completed:${this.buildFileFingerprint(file.buffer)}`,
        {
          mode: "guest",
          fileExtension: file.originalname.includes(".")
            ? (file.originalname.split(".").pop()?.toLowerCase() ?? null)
            : null,
        },
      );
    }

    const protectionResult =
      await this.protectedAnalyzeService.executeProtectedAnalyze({
        context: this.buildProtectionContext(
          analysisContext,
          null,
          "cv-adaptation/analyze-guest",
        ),
        canonicalJobJson: canonicalJob?.canonicalJobJson ?? {
          description: normalizedJobDescriptionText,
        },
        existingRequirements: effectiveRequirements ?? undefined,
        jobDescriptionText: normalizedJobDescriptionText,
        loadMasterCvText: async () => {
          if (resolvedMasterCvText) {
            return resolvedMasterCvText;
          }

          if (hasTextInput) {
            this.validateCvTextInput(normalizedMasterCvText);
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
            return await this.mapFileExtractionError(error, {
              context: this.buildProtectionContext(
                analysisContext,
                null,
                "cv-adaptation/analyze-guest",
              ),
              file,
              routeKey: "cv-adaptation/analyze-guest",
            });
          }
        },
        payload: {
          cvFingerprint:
            shouldUseUploadedFile && file
              ? this.buildFileFingerprint(file.buffer)
              : null,
          hasFile: shouldUseUploadedFile,
          jobDescriptionText: normalizedJobDescriptionText,
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

    if (!existingRequirementSet) {
      await this.persistRequirementSetFromAnalysis({
        canonicalJob,
        analysisModel: protectionResult.result.analysisModel,
        analysisPromptVersion: protectionResult.result.analysisPromptVersion,
        structuredRequirements: protectionResult.result.structuredRequirements,
      });
    }

    const snapshot = await this.createAnalysisCvSnapshot({
      sourceType: hasTextInput ? "text_input" : "uploaded_file",
      text: finalMasterCvText,
      guestSessionHash: this.hashGuestSessionToken(
        analysisContext?.sessionPublicToken,
      ),
      file: shouldUseUploadedFile ? file : undefined,
      userId: null,
    });

    return {
      ...protectionResult.result,
      masterCvText: finalMasterCvText,
      analysisCvSnapshotId: snapshot.id,
      guestSessionPublicToken: analysisContext?.sessionPublicToken ?? null,
    };
  }

  // Item 3 do plano de LLM síncronas → assíncronas: canonicalização da vaga +
  // análise (duas chamadas de LLM em série) hoje rodam dentro do request de
  // analyze-guest/analyze, com um timeout de 180s no client como remendo —
  // mesmo sintoma que MASTERCV e CV_GENERATION já tinham. A linha AnalysisJob
  // criada aqui também é o registro permanente de retenção/analytics decidido
  // em 2026-07-18: fica salva mesmo se a pessoa nunca converter.
  //
  // Deliberadamente NÃO reescreve analyzeGuest/analyzeAuthenticated — só os
  // envolve em fire-and-forget, igual já fizemos em processJob/deliverAdaptation.
  // Isso preserva toda a lógica de proteção (turnstile, rate limit, dedupe)
  // sem precisar desmontar o AnalysisProtectionFacade.
  async startGuestAnalysisJob(
    jobDescriptionText: string,
    file?: FileUpload,
    masterCvText?: string,
    turnstileToken?: string,
    analysisContext?: AnalysisRequestContext,
    radarJobId?: string,
  ): Promise<{
    jobId: string;
    status: "pending";
    guestSessionPublicToken: string | null;
    guestPossessionToken: string;
  }> {
    const turnstilePrecheck =
      await this.protectedAnalyzeService.precheckTurnstile(
        { turnstileToken },
        this.buildProtectionContext(
          analysisContext,
          null,
          "cv-adaptation/analyze-guest",
        ),
      );
    if (!turnstilePrecheck.ok) {
      throw new BadRequestException("Turnstile verification failed");
    }

    const guestSessionHash = this.hashGuestSessionToken(
      analysisContext?.sessionPublicToken,
    );

    // Token de posse real da análise guest (não confundir com o cuid do
    // job, que identifica mas não autentica posse). Mesmo padrão de
    // PasswordResetToken em auth.service.ts: randomBytes(32) cru devolvido
    // uma única vez ao cliente, só o hash SHA-256 é persistido.
    const guestPossessionToken = randomBytes(32).toString("hex");
    const guestPossessionTokenHash =
      hashGuestPossessionToken(guestPossessionToken);

    // Mesmo enriquecimento de startAuthenticatedAnalysisJob (ver
    // resolveAnalysisJobDescription) — faltava aqui, o que deixava toda
    // análise guest via radar sem jobTitle/companyName confiáveis desde a
    // origem (só o texto colado, nunca o Job/Company reais).
    const resolved = await this.resolveAnalysisJobDescription({
      radarJobId,
      jobDescriptionText,
    });

    const job = await this.database.analysisJob.create({
      data: {
        ownerKind: "guest",
        status: "pending",
        guestSessionHash,
        guestPossessionTokenHash,
        jobDescriptionText: resolved.text,
        masterCvText: masterCvText?.trim() || null,
      },
    });

    this.processAnalysisJob(
      job.id,
      () =>
        this.analyzeGuest(
          resolved.text,
          file,
          masterCvText,
          turnstileToken,
          analysisContext,
        ),
      {
        context: this.buildProtectionContext(
          analysisContext,
          null,
          "cv-adaptation/analyze-guest",
        ),
        mode: "guest",
        cvSource: file ? "upload" : "master_cv",
        productOrigin: radarJobId ? "radar" : "direct",
      },
      {
        jobTitle: resolved.radarJobTitle,
        companyName: resolved.radarCompanyName,
      },
    ).catch((err) => {
      this.logger.error(
        `[analysis-job] ${job.id} background processing crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return {
      jobId: job.id,
      status: "pending",
      guestSessionPublicToken: analysisContext?.sessionPublicToken ?? null,
      guestPossessionToken,
    };
  }

  // Resolve a descrição da vaga antes de qualquer persistência — precisa
  // rodar aqui (não dentro de analyzeAuthenticated) porque
  // AnalysisJob.jobDescriptionText é obrigatório no schema e é gravado
  // logo abaixo, de forma síncrona, antes do processamento assíncrono via
  // processAnalysisJob. jobDescriptionText já preenchido tem precedência
  // só como TEXTO (cobre tanto colar manual quanto o auto-preenchimento
  // do fluxo de 1 clique do radar — ver jobIdParam em adaptar-client.tsx,
  // que sempre manda os dois juntos: jobDescriptionText E radarJobId).
  // jobTitle/companyName SEMPRE vêm do Job do radar quando radarJobId
  // existe, mesmo com jobDescriptionText presente — nunca da IA. Achado
  // investigando análises via radar salvas com "Não informado": a IA
  // reextrai cargo/empresa do texto da vaga, que raramente repete o nome
  // da empresa no corpo da descrição, então falha silenciosamente mesmo
  // com o dado real disponível ali no Job. A versão anterior descartava
  // radarJobId inteiro sempre que jobDescriptionText vinha preenchido,
  // que é sempre o caso nesse fluxo — nunca chegava a buscar o Job. Ver
  // processAnalysisJob, que prioriza esses valores sobre o que a IA
  // extrair.
  private async resolveAnalysisJobDescription(dto: {
    radarJobId?: string | null;
    jobDescriptionText?: string | null;
  }): Promise<{
    text: string;
    radarJobTitle: string | null;
    radarCompanyName: string | null;
  }> {
    let radarJobTitle: string | null = null;
    let radarCompanyName: string | null = null;

    if (dto.radarJobId) {
      const job = await this.database.job.findUnique({
        where: { id: dto.radarJobId },
        select: {
          id: true,
          title: true,
          descriptionClean: true,
          status: true,
          company: { select: { name: true } },
        },
      });

      // Sem jobDescriptionText, o Job é a ÚNICA fonte de texto — estado
      // inválido (não encontrado/inativo/sem descrição) bloqueia a
      // análise. Com jobDescriptionText já em mãos, o texto continua
      // válido independente do estado atual do Job — só deixa de
      // enriquecer jobTitle/companyName, nunca bloqueia por causa disso.
      if (!dto.jobDescriptionText) {
        if (!job) {
          throw new NotFoundException(`Vaga não encontrada: ${dto.radarJobId}`);
        }
        if (job.status !== "active") {
          throw new BadRequestException("Esta vaga não está mais disponível.");
        }
        if (!job.descriptionClean || job.descriptionClean.length < 50) {
          throw new BadRequestException(
            "Esta vaga não tem descrição suficiente para análise.",
          );
        }
      }

      if (job) {
        radarJobTitle = job.title || null;
        radarCompanyName = job.company?.name || null;
      }

      if (!dto.jobDescriptionText && job) {
        return {
          text: job.descriptionClean as string,
          radarJobTitle,
          radarCompanyName,
        };
      }
    }

    if (dto.jobDescriptionText) {
      return { text: dto.jobDescriptionText, radarJobTitle, radarCompanyName };
    }

    throw new BadRequestException(
      "É necessário fornecer a descrição da vaga ou um radarJobId válido.",
    );
  }

  async startAuthenticatedAnalysisJob(
    userId: string,
    dto: AnalyzeCvDto,
    file?: FileUpload,
    analysisContext?: AnalysisRequestContext,
  ): Promise<{ jobId: string; status: "pending" }> {
    // Fase 2C: liga o entrypoint autenticado ao pipeline canônico de CV
    // (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md).
    // inputMode "profile" fica de fora desta sub-fase (não deriva de um
    // CvSource/arquivo real — é composto a partir do UserProfile já
    // salvo) — cai sempre no caminho legado abaixo, com ou sem a flag,
    // pendência documentada no relatório da Fase 2C. Com a flag desligada
    // (default), esta condição nunca é verdadeira e o resto do método
    // roda exatamente como antes, bit a bit.
    if (isCvStructuredProfilePipelineEnabled() && dto.inputMode !== "profile") {
      return this.startAuthenticatedAnalysisJobCanonical(
        userId,
        dto,
        file,
        analysisContext,
      );
    }

    const turnstilePrecheck =
      await this.protectedAnalyzeService.precheckTurnstile(
        { turnstileToken: dto.turnstileToken },
        this.buildProtectionContext(
          analysisContext,
          userId,
          "cv-adaptation/analyze",
        ),
      );
    if (!turnstilePrecheck.ok) {
      throw new BadRequestException("Turnstile verification failed");
    }

    // Muta o dto com o texto resolvido — analyzeAuthenticated (chamado
    // abaixo, em background) lê dto.jobDescriptionText de novo pra sua
    // própria validação/normalização, e precisa enxergar o mesmo valor.
    const resolved = await this.resolveAnalysisJobDescription(dto);
    dto.jobDescriptionText = resolved.text;

    const job = await this.database.analysisJob.create({
      data: {
        ownerKind: "authenticated",
        status: "pending",
        userId,
        jobDescriptionText: dto.jobDescriptionText,
        masterCvText: dto.masterCvText?.trim() || null,
      },
    });

    this.processAnalysisJob(
      job.id,
      () => this.analyzeAuthenticated(userId, dto, file, analysisContext),
      {
        context: this.buildProtectionContext(
          analysisContext,
          userId,
          "cv-adaptation/analyze",
        ),
        mode: "authenticated",
        cvSource: file ? "upload" : "master_cv",
        // dto.radarJobOrigin (resolveJobProductOrigin no client) é a
        // origem real quando a análise veio do fluxo de 1 clique em
        // /radar/[slug] — pode ser "monitor"/"monitor_email" quando a vaga
        // foi descoberta pelo Alerta, não só "radar". Sem o campo
        // (chamadas antigas, ou fora desse fluxo), cai no fallback anterior.
        productOrigin:
          dto.radarJobOrigin ?? (dto.radarJobId ? "radar" : "direct"),
      },
      {
        jobTitle: resolved.radarJobTitle,
        companyName: resolved.radarCompanyName,
      },
    ).catch((err) => {
      this.logger.error(
        `[analysis-job] ${job.id} background processing crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return { jobId: job.id, status: "pending" };
  }

  // Fase 2C — entrypoint autenticado do pipeline canônico
  // (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, seções 1
  // e 11). Único trabalho aqui é PERSISTIR (CvSource/CvSubmission via
  // CvProcessingEntrypointService, e o AnalysisJob apontando
  // cvProcessingJobId) e responder — nenhuma chamada de IA acontece dentro
  // deste método nem de nada que ele aguarda. A extração/promoção de
  // Master roda depois, em CvProcessingWorker (cron); a análise em si roda
  // depois disso, em CvAnalysisWorker (cron) — nunca aqui, nunca como
  // Promise fire-and-forget.
  //
  // Turnstile continua verificado uma única vez aqui (não é chamada de
  // IA, é verificação de bot da Cloudflare) — o token não é reaproveitado
  // depois no worker (ver skipTurnstile em runCanonicalAuthenticatedAnalysis).
  private async startAuthenticatedAnalysisJobCanonical(
    userId: string,
    dto: AnalyzeCvDto,
    file: FileUpload | undefined,
    analysisContext?: AnalysisRequestContext,
  ): Promise<{ jobId: string; status: "pending" }> {
    if (!this.cvProcessingEntrypoint || !this.cvMasterPromotionForAnalysis) {
      throw new Error(
        "CV_STRUCTURED_PROFILE_PIPELINE_ENABLED está ligado, mas " +
          "CvProcessingEntrypointService/CvMasterPromotionService não foram " +
          "injetados em CvAdaptationService — verifique cv-adaptation.module.ts.",
      );
    }

    const turnstilePrecheck =
      await this.protectedAnalyzeService.precheckTurnstile(
        { turnstileToken: dto.turnstileToken },
        this.buildProtectionContext(
          analysisContext,
          userId,
          "cv-adaptation/analyze",
        ),
      );
    if (!turnstilePrecheck.ok) {
      throw new BadRequestException("Turnstile verification failed");
    }

    const resolved = await this.resolveAnalysisJobDescription(dto);
    const jobDescriptionText = resolved.text;

    // Resolução de conteúdo — só extração/validação LOCAL (parsing de
    // arquivo, normalização de texto), nunca chamada de IA. `cvText: null`
    // significa "sem conteúdo novo": reusa o Master atual já processado
    // (cenário 1 do escopo da Fase 2C).
    let cvText: string | null = null;
    let submission:
      | {
          origin: "FILE_UPLOAD";
          fileName: string;
          mimeType: string;
          fileSizeBytes: number;
        }
      | { origin: "PASTED_TEXT" }
      | null = null;

    if (dto.masterCvText?.trim()) {
      cvText = this.validateCvTextInput(
        this.normalizeSnapshotText(dto.masterCvText),
      );
      submission = { origin: "PASTED_TEXT" };
    } else if (file) {
      try {
        validateCvFileEnvelope(file);
      } catch (error) {
        await this.mapFileExtractionError(error, {
          context: this.buildProtectionContext(
            analysisContext,
            userId,
            "cv-adaptation/analyze",
          ),
          file,
          routeKey: "cv-adaptation/analyze",
        });
      }

      let extracted: string;
      try {
        extracted = await extractTextFromCvFile(file);
      } catch (error) {
        return (await this.mapFileExtractionError(error, {
          context: this.buildProtectionContext(
            analysisContext,
            userId,
            "cv-adaptation/analyze",
          ),
          file,
          routeKey: "cv-adaptation/analyze",
        })) as never;
      }

      cvText = this.normalizeSnapshotText(extracted);
      submission = {
        fileName: file.originalname,
        fileSizeBytes: file.buffer.length,
        mimeType: file.mimetype,
        origin: "FILE_UPLOAD",
      };
    } else if (dto.masterResumeId) {
      const resume = await this.database.resume.findFirst({
        select: { rawText: true },
        where: { id: dto.masterResumeId, userId },
      });
      if (!resume?.rawText?.trim()) {
        throw new BadRequestException(
          "Resume not found or has no text content.",
        );
      }
      cvText = this.normalizeSnapshotText(resume.rawText);
      submission = { origin: "PASTED_TEXT" };
    }

    let cvProcessingJobId: string;
    let cvSubmissionId: string | null = null;

    if (cvText === null) {
      // Cenário 1: reusar o Master atual já processado — nunca reextrai.
      const active =
        await this.cvMasterPromotionForAnalysis.getActiveDesignation({
          ownerType: "USER",
          userId,
        });
      if (!active) {
        throw new BadRequestException(
          "Nenhum CV Base encontrado. Envie um arquivo ou cole o texto do seu currículo.",
        );
      }
      const existingJob = await this.database.cvProcessingJob.findFirst({
        orderBy: { finishedAt: "desc" },
        where: {
          cvStructuredProfileId: active.cvStructuredProfileId,
          status: "READY",
        },
      });
      if (!existingJob) {
        throw new BadRequestException(
          "O CV Base ainda está sendo processado. Tente novamente em instantes.",
        );
      }
      cvProcessingJobId = existingJob.id;
    } else {
      const masterIntent = await this.resolveCanonicalMasterIntent(
        userId,
        dto.saveAsMaster === true,
      );
      const enqueued = await this.cvProcessingEntrypoint.enqueueFromUserText({
        masterIntent,
        submission: submission ?? { origin: "PASTED_TEXT" },
        text: cvText,
        userId,
      });
      cvProcessingJobId = enqueued.job.id;
      cvSubmissionId = enqueued.cvSubmission.id;
    }

    const analysisJob = await this.database.analysisJob.create({
      data: {
        cvProcessingJobId,
        cvSubmissionId,
        jobDescriptionText,
        ownerKind: "authenticated",
        status: "pending",
        userId,
      },
    });

    return { jobId: analysisJob.id, status: "pending" };
  }

  private async resolveCanonicalMasterIntent(
    userId: string,
    explicitSaveAsMaster: boolean,
  ): Promise<"NONE" | "PROMOTE_IF_FIRST" | "PROMOTE_EXPLICIT"> {
    if (explicitSaveAsMaster) {
      return "PROMOTE_EXPLICIT";
    }
    const active =
      await this.cvMasterPromotionForAnalysis?.getActiveDesignation({
        ownerType: "USER",
        userId,
      });
    return active ? "NONE" : "PROMOTE_IF_FIRST";
  }

  // Chamado exclusivamente por CvAnalysisWorker (cv-analysis.worker.ts),
  // nunca dentro de um request HTTP — roda depois que o CvProcessingJob já
  // está READY (extração + Base de Talentos + Master, se aplicável, já
  // persistidos). Espelha a segunda metade de analyzeAuthenticated
  // (chamada real de IA via protectedAnalyzeService), mas lê o texto do CV
  // exclusivamente do CvStructuredProfile.canonicalJson daquele
  // processamento (nunca texto bruto/arquivo) e nunca decide Master (isso
  // já aconteceu, se aplicável, antes deste método ser chamado).
  async runCanonicalAuthenticatedAnalysis(input: {
    userId: string;
    jobDescriptionText: string;
    canonicalCvText: string;
    analysisContext?: AnalysisRequestContext;
  }): Promise<{
    adaptedContentJson: unknown;
    previewText: string;
    masterCvText: string;
    analysisCvSnapshotId: string;
  }> {
    const normalizedJobDescriptionText = this.validateJobDescription(
      input.jobDescriptionText,
      {
        context: this.buildProtectionContext(
          input.analysisContext,
          input.userId,
          "cv-adaptation/analyze",
        ),
        routeKey: "cv-adaptation/analyze",
      },
    );
    const canonicalJob = await this.resolveCanonicalJob(
      normalizedJobDescriptionText,
      "runCanonicalAuthenticatedAnalysis",
    );
    const existingRequirementSet =
      await this.resolveExistingRequirementSet(canonicalJob);
    const effectiveRequirements = await this.resolveEffectiveRequirements(
      existingRequirementSet,
    );
    const existingKeywordRule = await this.resolveExistingKeywordRule({
      jobRequirementSetId: existingRequirementSet?.id ?? null,
      userId: input.userId,
    });

    const protectionResult =
      await this.protectedAnalyzeService.executeProtectedAnalyze({
        canonicalJobJson: canonicalJob?.canonicalJobJson ?? {
          description: normalizedJobDescriptionText,
        },
        context: this.buildProtectionContext(
          input.analysisContext,
          input.userId,
          "cv-adaptation/analyze",
        ),
        existingKeywordRule,
        existingRequirements: effectiveRequirements ?? undefined,
        jobDescriptionText: normalizedJobDescriptionText,
        loadMasterCvText: async () => input.canonicalCvText,
        payload: {
          cvFingerprint: null,
          hasFile: false,
          hasTextInput: true,
          jobDescriptionText: normalizedJobDescriptionText,
          masterResumeId: null,
          profileUpdatedAt: null,
          route: "cv-adaptation/analyze",
          saveAsMaster: false,
          textFingerprint: this.buildFileFingerprint(
            Buffer.from(input.canonicalCvText),
          ),
          userId: input.userId,
        },
        skipTurnstile: true,
        turnstileToken: null,
      });

    if (!protectionResult.ok) {
      throw new BadRequestException(
        this.toProtectedBoundaryMessage(protectionResult),
      );
    }

    if (!existingRequirementSet) {
      await this.persistRequirementSetFromAnalysis({
        analysisModel: protectionResult.result.analysisModel,
        analysisPromptVersion: protectionResult.result.analysisPromptVersion,
        canonicalJob,
        structuredRequirements: protectionResult.result.structuredRequirements,
      });
    }

    const snapshot = await this.createAnalysisCvSnapshot({
      file: undefined,
      guestSessionHash: null,
      sourceType: "master_resume",
      text: input.canonicalCvText,
      userId: input.userId,
    });

    return {
      ...protectionResult.result,
      analysisCvSnapshotId: snapshot.id,
      masterCvText: input.canonicalCvText,
    };
  }

  // Alias público (Fase 2C) — CvAnalysisWorker precisa renderizar o
  // canonicalJson de um CvStructuredProfile como texto, reaproveitando
  // exatamente o mesmo formatador já usado pelo modo perfil legado
  // (renderCanonicalProfileToText, privado), sem duplicar a lógica de
  // formatação em outro arquivo.
  renderCanonicalProfileTextForPipeline(data: CanonicalProfileData): string {
    return this.renderCanonicalProfileToText(data);
  }

  // Alias público (Fase 2C) — mesma extração de sinais (jobTitle/
  // companyName/scoreBefore/scoreAfter) já usada por processAnalysisJob,
  // reaproveitada por CvAnalysisWorker ao persistir o AnalysisJob
  // "succeeded" do pipeline novo.
  extractAnalysisJobSignalsForPipeline(adaptedContentJson: unknown): {
    jobTitle: string | null;
    companyName: string | null;
    scoreBefore: number | null;
    scoreAfter: number | null;
  } {
    return this.extractAnalysisJobSignals(adaptedContentJson);
  }

  private async processAnalysisJob(
    jobId: string,
    run: () => Promise<{
      adaptedContentJson: unknown;
      previewText: string;
      masterCvText: string;
      analysisCvSnapshotId: string;
    }>,
    analytics: {
      context: AnalysisRequestContext & { routeKey: string };
      mode: "guest" | "authenticated";
      cvSource: "master_cv" | "upload";
      productOrigin: ProductOrigin;
    },
    // Quando a análise veio do radar, o Job já tem cargo/empresa reais e
    // curados — sempre prevalecem sobre o que a IA reextrair do texto
    // colado (que frequentemente não repete o nome da empresa no corpo
    // da descrição e devolve "Não informado" mesmo com o dado certo
    // disponível). Sem radar, cai pro que a IA extraiu, como antes.
    radarFallback?: { jobTitle: string | null; companyName: string | null },
  ): Promise<void> {
    const startedAt = new Date();

    await this.database.analysisJob.update({
      where: { id: jobId },
      data: { status: "processing", startedAt },
    });

    const journeyMetadata = this.buildAnalysisJourneyMetadata(
      analytics.context,
    );

    await this.recordFunnelEvent(
      "analysis_started",
      analytics.context,
      analytics.context.routeKey,
      `analysis_started:${jobId}`,
      {
        analysis_id: jobId,
        mode: analytics.mode,
        origin: analytics.context.routeKey,
        product_origin: analytics.productOrigin,
        ...journeyMetadata,
      },
    );

    try {
      const result = await run();
      const signals = this.extractAnalysisJobSignals(result.adaptedContentJson);
      const jobTitle = radarFallback?.jobTitle ?? signals.jobTitle;
      const companyName = radarFallback?.companyName ?? signals.companyName;
      // Corrige vaga.cargo/vaga.empresa DENTRO do JSON persistido — não só
      // as colunas-irmãs acima — sempre que o radar já sabia a resposta
      // certa (ver reconcileVagaFields).
      const reconciledContentJson = radarFallback
        ? this.reconcileVagaFields(result.adaptedContentJson, radarFallback)
        : result.adaptedContentJson;

      await this.database.analysisJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          adaptedContentJson: reconciledContentJson as Prisma.InputJsonValue,
          previewText: result.previewText,
          masterCvText: result.masterCvText,
          analysisCvSnapshotId: result.analysisCvSnapshotId,
          jobTitle,
          companyName,
          scoreBefore: signals.scoreBefore,
          scoreAfter: signals.scoreAfter,
        },
      });

      await this.recordFunnelEvent(
        "analysis_completed",
        analytics.context,
        analytics.context.routeKey,
        `analysis_completed:${jobId}`,
        {
          analysis_id: jobId,
          mode: analytics.mode,
          origin: analytics.context.routeKey,
          product_origin: analytics.productOrigin,
          processing_time_ms: Date.now() - startedAt.getTime(),
          cv_source: analytics.cvSource,
          ...journeyMetadata,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[analysis-job] ${jobId} failed: ${message}`);
      await this.database.analysisJob.update({
        where: { id: jobId },
        data: { status: "failed", finishedAt: new Date(), lastError: message },
      });

      const failure = this.classifyAnalysisFailure(error);
      await this.recordFunnelEvent(
        "analysis_failed",
        analytics.context,
        analytics.context.routeKey,
        `analysis_failed:${jobId}`,
        {
          analysis_id: jobId,
          mode: analytics.mode,
          origin: analytics.context.routeKey,
          product_origin: analytics.productOrigin,
          processing_time_ms: Date.now() - startedAt.getTime(),
          stage: failure.stage,
          error_code: failure.errorCode,
          retryable: failure.retryable,
          ...journeyMetadata,
        },
      );
    }
  }

  private classifyAnalysisFailure(error: unknown): {
    stage: "validation" | "protection" | "processing";
    errorCode: string;
    retryable: boolean;
  } {
    if (error instanceof BadRequestException) {
      return {
        stage: "validation",
        errorCode: "invalid_input",
        retryable: false,
      };
    }
    if (error instanceof UnauthorizedException) {
      return {
        stage: "protection",
        errorCode: "unauthorized",
        retryable: false,
      };
    }
    if (error instanceof NotFoundException) {
      return { stage: "validation", errorCode: "not_found", retryable: false };
    }
    return {
      stage: "processing",
      errorCode: "processing_failed",
      retryable: true,
    };
  }

  // BusinessFunnelEventService.exportToPostHog só lê visitor_id/sessionInternalId
  // de dentro de metadata (nunca de campos soltos do context) — mesmo padrão
  // que o frontend já usa via getAnalyticsBaseProperties(). Sem isso aqui,
  // analysis_started/completed/failed chegam ao PostHog com os dois nulos
  // mesmo com buildProtectionContext preservando os valores.
  private buildAnalysisJourneyMetadata(context: AnalysisRequestContext): {
    visitor_id: string | null;
    sessionInternalId: string | null;
  } {
    return {
      visitor_id: context.visitorId ?? null,
      sessionInternalId: context.journeySessionInternalId ?? null,
    };
  }

  private async recordFunnelEvent(
    eventName: string,
    context: AnalysisRequestContext,
    routeKey: string,
    idempotencyKey: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.funnelEvents.record(
        { eventName, eventVersion: 1, idempotencyKey, metadata, routeKey },
        context,
        "backend",
      );
    } catch (err) {
      this.logger.warn(
        `[analytics] failed to record ${eventName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Sobrescreve vaga.cargo/vaga.empresa DENTRO do próprio JSON persistido
  // com o cargo/empresa já conhecidos com certeza (Job do radar ou o que
  // já foi resolvido antes) — nunca confiar no que a IA reextraiu do
  // texto colado pra esses dois campos quando já sabemos a resposta certa.
  // Histórico: dois fixes anteriores (52f6ffb, 1b6e411) corrigiram as
  // colunas-irmãs AnalysisJob/CvAdaptation.jobTitle/companyName, mas
  // NUNCA tocaram o vaga.{cargo,empresa} embutido no adaptedContentJson —
  // que é o que o relatório (/adaptar/resultado), o fluxo guest e todo o
  // resto de fato leem. Sem isso, a coluna fica certa e o JSON continua
  // errado pra sempre, porque isso é IMUTÁVEL — mesmo array/objeto salvo
  // exatamente como a IA devolveu.
  private reconcileVagaFields(
    adaptedContentJson: unknown,
    known: { jobTitle?: string | null; companyName?: string | null },
  ): unknown {
    if (!adaptedContentJson || typeof adaptedContentJson !== "object") {
      return adaptedContentJson;
    }
    if (!known.jobTitle && !known.companyName) {
      return adaptedContentJson;
    }
    const data = adaptedContentJson as Record<string, unknown>;
    const vaga =
      data.vaga && typeof data.vaga === "object"
        ? (data.vaga as Record<string, unknown>)
        : {};
    return {
      ...data,
      vaga: {
        ...vaga,
        ...(known.jobTitle ? { cargo: known.jobTitle } : {}),
        ...(known.companyName ? { empresa: known.companyName } : {}),
      },
    };
  }

  private extractAnalysisJobSignals(adaptedContentJson: unknown): {
    jobTitle: string | null;
    companyName: string | null;
    scoreBefore: number | null;
    scoreAfter: number | null;
  } {
    if (!adaptedContentJson || typeof adaptedContentJson !== "object") {
      return {
        jobTitle: null,
        companyName: null,
        scoreBefore: null,
        scoreAfter: null,
      };
    }

    const data = adaptedContentJson as {
      vaga?: { cargo?: unknown; empresa?: unknown };
      scoreBefore?: unknown;
      scoreAfter?: unknown;
    };

    return {
      jobTitle: typeof data.vaga?.cargo === "string" ? data.vaga.cargo : null,
      companyName:
        typeof data.vaga?.empresa === "string" ? data.vaga.empresa : null,
      scoreBefore:
        typeof data.scoreBefore === "number"
          ? Math.round(data.scoreBefore)
          : null,
      scoreAfter:
        typeof data.scoreAfter === "number"
          ? Math.round(data.scoreAfter)
          : null,
    };
  }

  async getAnalysisJobStatus(
    jobId: string,
    input: { userId: string | null; sessionPublicToken: string | null },
  ) {
    const job = await this.database.analysisJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException("analysis job not found");
    }

    const isOwner = job.userId
      ? job.userId === input.userId
      : job.guestSessionHash
        ? job.guestSessionHash ===
          this.hashGuestSessionToken(input.sessionPublicToken)
        : true;

    if (!isOwner) {
      throw new NotFoundException("analysis job not found");
    }

    return {
      jobId: job.id,
      status: job.status,
      lastError: job.status === "failed" ? job.lastError : null,
      adaptedContentJson:
        job.status === "succeeded" ? job.adaptedContentJson : null,
      previewText: job.status === "succeeded" ? job.previewText : null,
      masterCvText: job.status === "succeeded" ? job.masterCvText : null,
      analysisCvSnapshotId:
        job.status === "succeeded" ? job.analysisCvSnapshotId : null,
      // job.jobTitle/companyName já priorizam o cargo/empresa curados do
      // Radar sobre o que a IA reextrai do texto colado (ver radarFallback
      // em processAnalysisJob) — sem isso aqui, quem consome este status
      // só enxerga adaptedContentJson.vaga.cargo/empresa, que fica vazio
      // sempre que a IA não repete o nome da empresa no corpo da vaga.
      jobTitle: job.status === "succeeded" ? job.jobTitle : null,
      companyName: job.status === "succeeded" ? job.companyName : null,
    };
  }

  // DTO deliberadamente estreito (nunca reaproveitar o shape autenticado
  // com campos "a mais" que o cliente ignora — isso é exatamente o tipo de
  // acidente de serialização que vaza dado, ver ADENDO-hardening.md seção
  // 2). Usado só quando guest_analysis_auth_gate_enabled está ligado e a
  // requisição não está autenticada — nunca contém conteúdo derivado da
  // análise, só o status.
  async getGuestAnalysisJobStatusOnly(
    jobId: string,
    possessionToken: string | null,
  ): Promise<{ status: AnalysisJobStatusValue }> {
    if (!possessionToken) {
      throw new NotFoundException("analysis job not found");
    }

    // jobId (cuid) identifica a análise, mas nunca autentica posse dela —
    // sem o token de posse correto, nem o status é revelado.
    const owns = await this.verifyGuestPossessionToken(jobId, possessionToken);

    if (!owns) {
      throw new NotFoundException("analysis job not found");
    }

    const job = await this.database.analysisJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (!job) {
      throw new NotFoundException("analysis job not found");
    }

    return { status: job.status };
  }

  // Fase 4 do gate de autenticação guest — claim server-side, sem
  // reprocessar IA. Diferente de getGuestAnalysisJobStatusOnly, este
  // método é chamado só depois de autenticado: ownership do AnalysisJob
  // já foi transferida em transferAnalysisJobOwnership
  // (OAuthAttemptService, disparada a partir da correlação provada por
  // possession token + state no callback OAuth) — aqui a checagem é
  // simplesmente job.userId === userId, o mesmo padrão de
  // getAnalysisJobStatus para autenticado. Não aceita jobId "solto" de
  // outro usuário, nunca.
  //
  // O conteúdo (adaptedContentJson/previewText/masterCvText/jobTitle/
  // companyName/jobDescriptionText) vem estritamente do que
  // processAnalysisJob já gravou no AnalysisJob — nunca do corpo da
  // requisição. Delega para saveGuestPreview (já testado, já usado hoje)
  // só trocando a FONTE dos dados de entrada; toda a lógica de resolução
  // de master CV, dedupe por (userId, analysisCvSnapshotId), hook de
  // candidatura e markAnalysisJobConverted é reaproveitada sem alteração
  // — o que garante, pelas mesmas garantias já existentes, que a
  // CvAdaptation criada aqui continua vinculada ao analysisCvSnapshotId
  // (crítico: é essa vinculação que exclui o snapshot do cleanup de 30
  // dias em cleanupExpiredGuestSnapshots).
  async claimGuestAnalysisJob(
    userId: string,
    jobId: string,
    guestPossessionToken?: string,
  ): Promise<
    | { status: "pending" | "processing" | "failed" }
    | { status: "succeeded"; cvAdaptationId: string }
  > {
    let job = await this.database.analysisJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException("analysis job not found");
    }

    if (job.userId !== userId) {
      // Único caminho de transferência de ownership fora do OAuth: prova
      // de posse via guestPossessionToken (mesma garantia criptográfica de
      // OAuthAttemptService.transferAnalysisJobOwnership — job ainda sem
      // dono + token bate com o hash). Job de outro usuário, ou sem token
      // válido, nunca é aceito.
      const canTransfer =
        job.userId === null &&
        !!guestPossessionToken &&
        (await this.verifyGuestPossessionToken(jobId, guestPossessionToken));

      if (!canTransfer) {
        throw new NotFoundException("analysis job not found");
      }

      await this.database.analysisJob.updateMany({
        where: {
          id: jobId,
          ownerKind: "guest",
          OR: [{ userId: null }, { userId }],
        },
        data: { userId },
      });

      job = await this.database.analysisJob.findUnique({
        where: { id: jobId },
      });

      if (!job || job.userId !== userId) {
        throw new NotFoundException("analysis job not found");
      }
    }

    // Idempotente: se já convertida (claim repetido, callback duplicado,
    // tentativa concorrente que já terminou antes), devolve o resultado
    // existente sem tocar em nada de novo.
    if (job.convertedAt && job.convertedCvAdaptationId) {
      return {
        status: "succeeded",
        cvAdaptationId: job.convertedCvAdaptationId,
      };
    }

    if (job.status !== "succeeded") {
      return { status: job.status };
    }

    if (!job.analysisCvSnapshotId) {
      throw new BadRequestException(
        "Succeeded analysis job is missing its snapshot reference.",
      );
    }

    const dto: SaveGuestPreviewDto = {
      adaptedContentJson: (job.adaptedContentJson ?? {}) as Record<
        string,
        unknown
      >,
      previewText: job.previewText ?? undefined,
      jobDescriptionText: job.jobDescriptionText,
      masterCvText: job.masterCvText ?? "",
      analysisCvSnapshotId: job.analysisCvSnapshotId,
      jobTitle: job.jobTitle ?? undefined,
      companyName: job.companyName ?? undefined,
    };

    const adaptation = await this.saveGuestPreview(userId, dto);

    return { status: "succeeded", cvAdaptationId: adaptation.id };
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
    if (!dto.jobDescriptionText) {
      throw new BadRequestException(
        "É necessário fornecer a descrição da vaga ou um radarJobId válido.",
      );
    }

    const normalizedJobDescriptionText = this.validateJobDescription(
      dto.jobDescriptionText,
      {
        context: this.buildProtectionContext(
          analysisContext,
          userId,
          "cv-adaptation/analyze",
        ),
        routeKey: "cv-adaptation/analyze",
      },
    );
    const canonicalJob = await this.resolveCanonicalJob(
      normalizedJobDescriptionText,
      "analyzeAuthenticated",
    );
    const existingRequirementSet =
      await this.resolveExistingRequirementSet(canonicalJob);
    const effectiveRequirements = await this.resolveEffectiveRequirements(
      existingRequirementSet,
    );
    const existingKeywordRule = await this.resolveExistingKeywordRule({
      userId,
      jobRequirementSetId: existingRequirementSet?.id ?? null,
    });
    const hasTextInput = Boolean(dto.masterCvText?.trim());
    const shouldUseUploadedFile = !hasTextInput && Boolean(file);
    let sourceType:
      | "text_input"
      | "uploaded_file"
      | "master_resume"
      | "user_profile" = "master_resume";
    let resolvedMasterCvText: string | null = null;
    // Setado true dentro do branch de upload de arquivo quando o CV vira
    // master automaticamente (usuário sem nenhum CV ainda) — usado mais
    // abaixo pra decidir se roda o preenchimento de perfil mesmo sem
    // dto.saveAsMaster explícito.
    let becameMaster = dto.saveAsMaster === true;

    // Cache de dedupe é chaveado pelo payload abaixo; no modo "profile" nada
    // ali refletia o conteúdo do UserProfile (masterResumeId/cvFingerprint
    // ficam null), então editar o CV Base e reanalisar a mesma vaga dentro
    // do TTL do cache devolvia o resultado antigo, ignorando a edição.
    // profileUpdatedAt garante que qualquer alteração no formulário invalide
    // o cache.
    let profileUpdatedAtIso: string | null = null;
    if (dto.inputMode === "profile") {
      const profileTimestamp = await this.database.userProfile.findUnique({
        where: { userId },
        select: { updatedAt: true },
      });
      profileUpdatedAtIso = profileTimestamp?.updatedAt?.toISOString() ?? null;
    }

    if (hasTextInput && dto.masterCvText) {
      this.validateCvTextInput(this.normalizeSnapshotText(dto.masterCvText));
    }

    if (shouldUseUploadedFile && file) {
      try {
        validateCvFileEnvelope(file);
      } catch (error) {
        await this.mapFileExtractionError(error, {
          context: this.buildProtectionContext(
            analysisContext,
            userId,
            "cv-adaptation/analyze",
          ),
          file,
          routeKey: "cv-adaptation/analyze",
        });
      }

      await this.recordFunnelEvent(
        "cv_upload_completed",
        this.buildProtectionContext(
          analysisContext,
          userId,
          "cv-adaptation/analyze",
        ),
        "cv-adaptation/analyze",
        `cv_upload_completed:${this.buildFileFingerprint(file.buffer)}`,
        {
          mode: "authenticated",
          fileExtension: file.originalname.includes(".")
            ? (file.originalname.split(".").pop()?.toLowerCase() ?? null)
            : null,
        },
      );
    }

    const protectionResult =
      await this.protectedAnalyzeService.executeProtectedAnalyze({
        context: this.buildProtectionContext(
          analysisContext,
          userId,
          "cv-adaptation/analyze",
        ),
        canonicalJobJson: canonicalJob?.canonicalJobJson ?? {
          description: normalizedJobDescriptionText,
        },
        existingRequirements: effectiveRequirements ?? undefined,
        existingKeywordRule,
        jobDescriptionText: normalizedJobDescriptionText,
        loadMasterCvText: async () => {
          if (resolvedMasterCvText) {
            return resolvedMasterCvText;
          }

          // Modo perfil sempre vem dos campos estruturados do UserProfile —
          // nunca de Resume.rawText, mesmo que um masterResumeId tenha sido
          // enviado (ver resolveProfileMasterCvText).
          if (dto.inputMode === "profile") {
            sourceType = "user_profile";
            resolvedMasterCvText =
              await this.resolveProfileMasterCvText(userId);
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
              return await this.mapFileExtractionError(error, {
                context: this.buildProtectionContext(
                  analysisContext,
                  userId,
                  "cv-adaptation/analyze",
                ),
                file,
                routeKey: "cv-adaptation/analyze",
              });
            }

            const existingResumeCount = await this.database.resume.count({
              where: { userId },
            });
            const shouldBecomeMaster =
              existingResumeCount === 0 || dto.saveAsMaster === true;
            becameMaster = shouldBecomeMaster;

            if (shouldBecomeMaster) {
              const sourceFileUrl = await this.uploadResumeSourceFile(
                userId,
                file,
              );

              const createdResume = await this.database.$transaction(
                async (tx) => {
                  await tx.resume.updateMany({
                    where: { userId, isMaster: true },
                    data: { isMaster: false },
                  });
                  return tx.resume.create({
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
                },
              );
              this.triggerMasterCvExtraction({
                userId,
                resumeId: createdResume.id,
                rawText: masterCvText,
                file,
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
          cvFingerprint:
            shouldUseUploadedFile && file
              ? this.buildFileFingerprint(file.buffer)
              : null,
          hasFile: shouldUseUploadedFile,
          hasTextInput,
          // Modo "text_paste" (usado também na reanálise ao editar o CV em
          // /adaptacao-cv/[id]) não tinha nada no payload ligado ao conteúdo
          // do texto colado — reanalisar a mesma vaga com um CV editado
          // (ex: excluindo uma experiência) batia no cache e devolvia o
          // resultado antigo, sem refletir a edição.
          textFingerprint:
            hasTextInput && dto.masterCvText
              ? this.buildFileFingerprint(
                  Buffer.from(this.normalizeSnapshotText(dto.masterCvText)),
                )
              : null,
          jobDescriptionText: normalizedJobDescriptionText,
          masterResumeId: dto.masterResumeId ?? null,
          profileUpdatedAt: profileUpdatedAtIso,
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

    if (!existingRequirementSet) {
      await this.persistRequirementSetFromAnalysis({
        canonicalJob,
        analysisModel: protectionResult.result.analysisModel,
        analysisPromptVersion: protectionResult.result.analysisPromptVersion,
        structuredRequirements: protectionResult.result.structuredRequirements,
      });
    }

    const snapshot = await this.createAnalysisCvSnapshot({
      sourceType,
      text: finalMasterCvText,
      guestSessionHash: null,
      file: shouldUseUploadedFile ? file : undefined,
      userId,
    });

    if (becameMaster) {
      await this.mergeCanonicalProfileFromText({
        source: "base_cv_upload",
        sourceCvId: dto.masterResumeId ?? null,
        text: finalMasterCvText,
        userId,
      });
    }

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
      // journeySessionInternalId/visitorId (jornada de frontend, ver
      // analysis-protection/types.ts) precisam sobreviver aqui: este
      // context é capturado de forma síncrona ainda dentro do request
      // original (startGuestAnalysisJob/startAuthenticatedAnalysisJob) e
      // reaproveitado depois, no job assíncrono, para popular
      // analysis_started/completed/failed — sem isso os dois campos
      // ficam null nesses eventos mesmo estando disponíveis na origem.
      journeySessionInternalId: context?.journeySessionInternalId ?? null,
      visitorId: context?.visitorId ?? null,
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

  private async resolveCanonicalJob(
    jobDescriptionText: string,
    callerMethod: string,
  ): Promise<CanonicalJobLookupResult | null> {
    if (!this.jobCanonicalizationService) {
      return null;
    }

    try {
      return await this.jobCanonicalizationService.getOrCreateCanonicalJob(
        jobDescriptionText,
      );
    } catch (error) {
      this.logger.warn(
        `[job-canonicalization] failed in ${callerMethod}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async resolveExistingRequirementSet(
    canonicalJob: CanonicalJobLookupResult | null,
  ) {
    if (!canonicalJob || !this.jobRequirementSetsService) {
      return null;
    }

    try {
      return await this.jobRequirementSetsService.findByRequirementSourceHash(
        canonicalJob.requirementSourceHash,
      );
    } catch (error) {
      this.logger.warn(
        `[job-requirement-set] lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private hasRequirementMetadata(
    requirements:
      | Array<{
          dimension?:
            | "experience"
            | "skill"
            | "education"
            | "certification"
            | "language"
            | "location"
            | "work_model"
            | "other";
          gateLevel?: "hard" | "soft";
        }>
      | null
      | undefined,
  ) {
    return (
      Array.isArray(requirements) &&
      requirements.some(
        (requirement) => requirement.gateLevel || requirement.dimension,
      )
    );
  }

  private async resolveEffectiveRequirements(
    existingRequirementSet: {
      requirements: Array<{
        requirementKey: string;
        requirementText: string;
        importance: "high" | "medium" | "low";
        dimension?:
          | "experience"
          | "skill"
          | "education"
          | "certification"
          | "language"
          | "location"
          | "work_model"
          | "other";
        gateLevel?: "hard" | "soft";
      }>;
      id: string;
    } | null,
  ) {
    if (!existingRequirementSet) {
      return null;
    }

    if (this.hasRequirementMetadata(existingRequirementSet.requirements)) {
      return existingRequirementSet.requirements;
    }

    const latest = await this.database.cvAdaptation.findFirst({
      where: {
        jobRequirementSetId: existingRequirementSet.id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        adaptedContentJson: true,
      },
    });

    const parsed =
      latest?.adaptedContentJson &&
      typeof latest.adaptedContentJson === "object" &&
      !Array.isArray(latest.adaptedContentJson)
        ? (latest.adaptedContentJson as Record<string, unknown>)
        : null;

    const requirements = Array.isArray(parsed?.requirements)
      ? parsed.requirements
      : null;

    if (!requirements?.length) {
      return existingRequirementSet.requirements;
    }

    const hydrated = requirements.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      const requirementKey = String(record.requirementKey ?? "").trim();
      const requirementText = String(record.requirementText ?? "").trim();
      const importance = String(record.importance ?? "").trim();
      const dimension = String(record.dimension ?? "").trim();
      const gateLevel = String(record.gateLevel ?? "").trim();

      if (
        !requirementKey ||
        !requirementText ||
        !["high", "medium", "low"].includes(importance)
      ) {
        return [];
      }

      return [
        {
          requirementKey,
          requirementText,
          importance: importance as "high" | "medium" | "low",
          ...(dimension &&
          [
            "experience",
            "skill",
            "education",
            "certification",
            "language",
            "location",
            "work_model",
            "other",
          ].includes(dimension)
            ? {
                dimension: dimension as
                  | "experience"
                  | "skill"
                  | "education"
                  | "certification"
                  | "language"
                  | "location"
                  | "work_model"
                  | "other",
              }
            : {}),
          ...(gateLevel && ["hard", "soft"].includes(gateLevel)
            ? { gateLevel: gateLevel as "hard" | "soft" }
            : {}),
        },
      ];
    });

    return hydrated.length > 0 ? hydrated : existingRequirementSet.requirements;
  }

  private async persistRequirementSetFromAnalysis(input: {
    canonicalJob: CanonicalJobLookupResult | null;
    analysisModel: string;
    analysisPromptVersion: string;
    structuredRequirements: Array<{
      requirementKey: string;
      requirementText: string;
      importance: "high" | "medium" | "low";
      dimension?:
        | "experience"
        | "skill"
        | "education"
        | "certification"
        | "language"
        | "location"
        | "work_model"
        | "other";
      gateLevel?: "hard" | "soft";
    }>;
  }) {
    if (!input.canonicalJob || !this.jobRequirementSetsService) {
      return null;
    }

    try {
      return await this.jobRequirementSetsService.getOrCreateFromAnalysis({
        requirementSourceHash: input.canonicalJob.requirementSourceHash,
        canonicalJobId: input.canonicalJob.canonicalJobId,
        requirements: input.structuredRequirements,
        analysisModel: input.analysisModel,
        analysisPromptVersion: input.analysisPromptVersion,
      });
    } catch (error) {
      this.logger.warn(
        `[job-requirement-set] persist failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private normalizeKeywordRuleKey(value: string): string {
    return value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("pt-BR");
  }

  private async resolveExistingKeywordRule(input: {
    userId: string | null;
    jobRequirementSetId: string | null;
  }): Promise<
    | {
        presentes: Array<{ kw: string; pontos: number }>;
        possiveis: Array<{ kw: string; pontos: number }>;
        ausentes: Array<{ kw: string; pontos: number }>;
      }
    | undefined
  > {
    if (!input.userId || !input.jobRequirementSetId) {
      return undefined;
    }

    const recent = await this.database.cvAdaptation.findMany({
      where: {
        userId: input.userId,
        jobRequirementSetId: input.jobRequirementSetId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        adaptedContentJson: true,
      },
    });

    const parsedRecent = recent
      .map((entry) => {
        const json = entry.adaptedContentJson;
        return json && typeof json === "object" && !Array.isArray(json)
          ? (json as Record<string, unknown>)
          : null;
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null);

    const latest = parsedRecent[0] ?? null;
    const latestKeywordRecord =
      latest?.keywords &&
      typeof latest.keywords === "object" &&
      !Array.isArray(latest.keywords)
        ? (latest.keywords as Record<string, unknown>)
        : null;

    const frozenSelection = parsedRecent
      .map((entry) => entry.selectedMissingKeywords)
      .find(
        (value): value is string[] =>
          Array.isArray(value) &&
          value.some(
            (item) => typeof item === "string" && item.trim().length > 0,
          ),
      );

    const allowedKeys = frozenSelection?.length
      ? new Set(
          frozenSelection
            .map((keyword) => this.normalizeKeywordRuleKey(keyword))
            .filter((keyword) => keyword.length > 0),
        )
      : null;

    const toKeywordItems = (
      value: unknown,
      options?: { restrictToSelection?: boolean },
    ) =>
      Array.isArray(value)
        ? value.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const record = entry as Record<string, unknown>;
            const kw = String(record.kw ?? "").trim();
            if (!kw) return [];
            if (
              options?.restrictToSelection &&
              allowedKeys &&
              !allowedKeys.has(this.normalizeKeywordRuleKey(kw))
            ) {
              return [];
            }
            const rawPoints = Number(record.pontos ?? 0);
            return [
              {
                kw,
                pontos:
                  Number.isFinite(rawPoints) && rawPoints > 0 ? rawPoints : 1,
              },
            ];
          })
        : [];

    const presentes = toKeywordItems(latestKeywordRecord?.presentes);
    const possiveis = toKeywordItems(latestKeywordRecord?.possiveis);
    const ausentes = toKeywordItems(latestKeywordRecord?.ausentes, {
      restrictToSelection: true,
    });

    if (
      presentes.length === 0 &&
      possiveis.length === 0 &&
      ausentes.length === 0
    ) {
      return undefined;
    }

    return {
      presentes,
      possiveis,
      ausentes,
    };
  }

  async saveGuestPreview(
    userId: string,
    dto: SaveGuestPreviewDto,
    file?: FileUpload,
    analysisContext?: AnalysisRequestContext,
  ) {
    // Mesma reconciliação de processAnalysisJob — dto.jobTitle/companyName
    // já chegam confiáveis (ver analyze-master-cv-flow.ts/
    // authenticated-analysis-flow.ts no frontend), mas o JSON em si pode
    // ter vindo de um cliente antigo/análise anterior sem essa correção.
    dto.adaptedContentJson = this.reconcileVagaFields(dto.adaptedContentJson, {
      jobTitle: dto.jobTitle ?? null,
      companyName: dto.companyName ?? null,
    }) as Record<string, unknown>;

    const defaultTemplate = await this.getDefaultTemplate();
    const canonicalJob = await this.resolveCanonicalJob(
      dto.jobDescriptionText,
      "saveGuestPreview",
    );
    const canonicalJobId = canonicalJob?.canonicalJobId ?? null;
    const existingRequirementSet =
      await this.resolveExistingRequirementSet(canonicalJob);
    const guestSessionHash = this.hashGuestSessionToken(
      dto.guestSessionPublicToken ?? analysisContext?.sessionPublicToken,
    );

    let linkedJobApplicationId: string | null = null;
    if (dto.jobApplicationId) {
      const owned = await this.database.jobApplication.findFirst({
        where: { id: dto.jobApplicationId, userId },
        select: { id: true },
      });
      if (owned) {
        linkedJobApplicationId = owned.id;
      }
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

    const existingMaster = await this.database.resume.findFirst({
      where: { userId, isMaster: true, kind: "master" },
      select: { id: true },
    });

    let masterResumeId: string;

    if (file) {
      const sourceFileUrl = await this.uploadResumeSourceFile(userId, file);
      // Sem master existente, este CV vira o primeiro master automaticamente
      // — dto.saveAsMaster só importa pra decidir SUBSTITUIR um master que
      // já existe.
      const shouldBecomeMaster = !existingMaster || dto.saveAsMaster === true;

      const created = await this.database.$transaction(async (tx) => {
        if (shouldBecomeMaster) {
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
            isMaster: shouldBecomeMaster,
          },
        });
      });

      masterResumeId = created.id;
      if (shouldBecomeMaster) {
        this.triggerMasterCvExtraction({
          userId,
          resumeId: created.id,
          rawText: dto.masterCvText,
          file,
        });
      }
    } else if (existingMaster) {
      masterResumeId = existingMaster.id;
    } else {
      // Sem arquivo e sem master existente — CV colado como texto vira o
      // primeiro master do usuário automaticamente, sem perguntar nada. O
      // título usa o nome do arquivo enviado na análise original (guardado
      // no snapshot), não um placeholder baseado na vaga.
      const originalFileName = snapshot?.originalFileName ?? null;
      const created = await this.database.resume.create({
        data: {
          userId,
          title: originalFileName
            ? originalFileName.replace(/\.[^.]+$/, "")
            : dto.jobTitle
              ? `CV para ${dto.jobTitle}`
              : "CV Importado",
          sourceFileName: originalFileName ?? undefined,
          kind: "master",
          status: "uploaded",
          sourceFileType: null,
          rawText: dto.masterCvText,
          isMaster: true,
        },
      });

      masterResumeId = created.id;
      this.triggerMasterCvExtraction({
        userId,
        resumeId: created.id,
        rawText: dto.masterCvText,
      });
    }

    const existingAdaptation = await this.database.cvAdaptation.findFirst({
      where: {
        userId,
        analysisCvSnapshotId: snapshot?.id ?? null,
      },
      include: {
        template: { select: { id: true, name: true, slug: true } },
        analysisCvSnapshot: {
          select: {
            sourceType: true,
            originalFileStorageKey: true,
            originalFileName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingAdaptation) {
      if (
        linkedJobApplicationId &&
        existingAdaptation.jobApplicationId !== linkedJobApplicationId
      ) {
        await this.database.cvAdaptation.update({
          where: { id: existingAdaptation.id },
          data: { jobApplicationId: linkedJobApplicationId },
        });
      }
      await this.triggerJobApplicationHook({
        cvAdaptationId: existingAdaptation.id,
        userId,
        jobTitle: existingAdaptation.jobTitle,
        companyName: existingAdaptation.companyName,
        jobDescriptionText: existingAdaptation.jobDescriptionText,
        targetStatus: "ANALYZED",
        origin: "analysis_auto",
        callerMethod: "saveGuestPreview(existing)",
        radarJobId: dto.radarJobId,
        radarJobOrigin: dto.radarJobOrigin,
        visitorId: analysisContext?.visitorId,
        journeySessionInternalId: analysisContext?.journeySessionInternalId,
      });
      const refreshedExisting = await this.database.cvAdaptation.findUnique({
        where: { id: existingAdaptation.id },
        include: {
          template: { select: { id: true, name: true, slug: true } },
          analysisCvSnapshot: {
            select: {
              sourceType: true,
              originalFileStorageKey: true,
              originalFileName: true,
            },
          },
        },
      });
      await this.markAnalysisJobConverted(
        snapshot?.id,
        userId,
        existingAdaptation.id,
      );

      return createCvAdaptationResponseDto(
        refreshedExisting ?? existingAdaptation,
      );
    }

    const adaptation = await this.database.cvAdaptation.create({
      data: {
        userId,
        masterResumeId,
        jobDescriptionText: dto.jobDescriptionText,
        templateId: defaultTemplate?.id ?? null,
        canonicalJobId,
        jobRequirementSetId: existingRequirementSet?.id ?? null,
        jobTitle: dto.jobTitle ?? null,
        companyName: dto.companyName ?? null,
        adaptedContentJson: dto.adaptedContentJson as Prisma.InputJsonValue,
        previewText: dto.previewText ?? null,
        analysisCvSnapshotId: snapshot?.id ?? null,
        jobApplicationId: linkedJobApplicationId,
        status: "pending",
        paymentStatus: "none",
      },
      include: {
        template: { select: { id: true, name: true, slug: true } },
        analysisCvSnapshot: {
          select: {
            sourceType: true,
            originalFileStorageKey: true,
            originalFileName: true,
          },
        },
      },
    });

    await this.triggerJobApplicationHook({
      cvAdaptationId: adaptation.id,
      userId,
      jobTitle: adaptation.jobTitle,
      companyName: adaptation.companyName,
      jobDescriptionText: adaptation.jobDescriptionText,
      targetStatus: "ANALYZED",
      origin: "analysis_auto",
      callerMethod: "saveGuestPreview",
      radarJobId: dto.radarJobId,
      radarJobOrigin: dto.radarJobOrigin,
      visitorId: analysisContext?.visitorId,
      journeySessionInternalId: analysisContext?.journeySessionInternalId,
    });

    const refreshedAdaptation = await this.database.cvAdaptation.findUnique({
      where: { id: adaptation.id },
      include: {
        template: { select: { id: true, name: true, slug: true } },
        analysisCvSnapshot: {
          select: {
            sourceType: true,
            originalFileStorageKey: true,
            originalFileName: true,
          },
        },
      },
    });

    await this.markAnalysisJobConverted(snapshot?.id, userId, adaptation.id);

    return createCvAdaptationResponseDto(refreshedAdaptation ?? adaptation);
  }

  // Marca em AnalysisJob (via analysisCvSnapshotId, o mesmo identificador que
  // já flui pela jornada do guest hoje) o momento em que a análise virou
  // conta de verdade — "converteu" pra fins de retenção/analytics significa
  // "criou conta e a análise foi salva" (saveGuestPreview), não "pagou pelo
  // CV". updateMany + convertedAt: null no where: idempotente, nunca falha
  // se não achar linha correspondente (ex: análise anterior à criação do
  // AnalysisJob) e nunca sobrescreve uma conversão já registrada.
  private async markAnalysisJobConverted(
    analysisCvSnapshotId: string | null | undefined,
    userId: string,
    cvAdaptationId: string,
  ): Promise<void> {
    if (!analysisCvSnapshotId) return;

    try {
      await this.database.analysisJob.updateMany({
        where: { analysisCvSnapshotId, convertedAt: null },
        data: {
          convertedAt: new Date(),
          convertedCvAdaptationId: cvAdaptationId,
          userId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `[analysis-job] failed to mark conversion for snapshot ${analysisCvSnapshotId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
            select: {
              sourceType: true,
              originalFileStorageKey: true,
              originalFileName: true,
            },
          },
          masterResume: { select: { title: true, sourceFileName: true } },
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

  async persistApplicationIdentity(
    userId: string,
    adaptationId: string,
    dto: SaveApplicationIdentityDto,
  ) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id: adaptationId, userId },
      select: {
        id: true,
        userId: true,
        jobTitle: true,
        companyName: true,
        jobDescriptionText: true,
        status: true,
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    const jobTitle = dto.jobTitle.trim();
    const companyName = dto.companyName.trim();

    if (
      adaptation.jobTitle !== jobTitle ||
      adaptation.companyName !== companyName
    ) {
      await this.database.cvAdaptation.update({
        where: { id: adaptation.id },
        data: { jobTitle, companyName },
      });
    }

    await this.jobApplicationsService.upsertFromCvAdaptation({
      userId,
      cvAdaptationId: adaptation.id,
      jobTitle,
      companyName,
      jobDescriptionText: adaptation.jobDescriptionText,
      targetStatus: adaptation.status === "delivered" ? "CV_READY" : "ANALYZED",
      origin: "optimized_cv_auto",
    });

    return { ok: true };
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
          select: {
            sourceType: true,
            originalFileStorageKey: true,
            originalFileName: true,
          },
        },
        masterResume: { select: { title: true, sourceFileName: true } },
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    return createCvAdaptationResponseDto(adaptation);
  }

  // Análise, CV adaptado e preparação de entrevista nunca podem ser apagados
  // — invariante de produto (usuário pagou por usar), reforçado depois do
  // incidente de perda de dados de 2026-07-18. Este método (e o endpoint
  // DELETE /cv-adaptation/:id) não tinha nenhum consumidor no frontend, mas
  // apagava a linha de verdade, sem nenhuma trava mesmo pra análise já paga.
  // Bloqueado de propósito, sem exceção — não reabrir sem decisão explícita.
  async delete(_userId: string, _id: string): Promise<never> {
    throw new BadRequestException(
      "Excluir análises não é permitido. Entre em contato com o suporte se precisar de ajuda.",
    );
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

    const updateResult = await this.database.cvAdaptation.updateMany({
      where: { id: adaptation.id, userId },
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

    if (updateResult.count !== 1) {
      throw new NotFoundException("adaptation not found");
    }

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
      const currentAdaptation = await tx.cvAdaptation.findFirst({
        where: { id: adaptation.id, userId },
        include: {
          template: { select: { id: true, name: true, slug: true } },
          cvUnlock: { select: { status: true } },
        },
      });

      if (!currentAdaptation) {
        throw new NotFoundException("adaptation not found");
      }

      if (currentAdaptation.cvUnlock?.status === "UNLOCKED") {
        return currentAdaptation;
      }

      if (!hasUnlimitedClaims) {
        await tx.user.update({
          where: { id: userId },
          data: { creditsRemaining: { decrement: 1 } },
        });
      }

      const updatedContent = this.withFrozenMissingKeywords(
        currentAdaptation.adaptedContentJson,
        dto?.selectedMissingKeywords,
      );

      // Always clear pre-generated aiAuditJson on unlock so deliverAdaptation
      // regenerates the CV incorporating both user-selected keywords and the
      // LLM-derived "possiveis" keywords (which mergeKeywordsForGeneration handles).
      const nextAdaptation = await tx.cvAdaptation.update({
        where: { id: currentAdaptation.id },
        data: {
          status: "paid",
          isUnlocked: true,
          unlockedAt: new Date(),
          adaptedContentJson: updatedContent as Prisma.InputJsonValue,
          aiAuditJson: Prisma.DbNull,
        },
        include: { template: { select: { id: true, name: true, slug: true } } },
      });

      await tx.cvUnlock.create({
        data: {
          userId,
          cvAdaptationId: currentAdaptation.id,
          creditsConsumed: hasUnlimitedClaims ? 0 : 1,
          source: hasUnlimitedClaims ? "ADMIN" : "CREDIT",
          status: "UNLOCKED",
          unlockedAt: new Date(),
        },
      });

      return nextAdaptation;
    });

    // Advance candidatura status to CV_READY synchronously so it reflects
    // immediately even if the background deliverAdaptation task fails.
    await this.triggerJobApplicationHook({
      cvAdaptationId: adaptation.id,
      userId,
      jobTitle: adaptation.jobTitle,
      companyName: adaptation.companyName,
      jobDescriptionText: adaptation.jobDescriptionText,
      targetStatus: "CV_READY",
      origin: "optimized_cv_auto",
      callerMethod: "redeemWithCredit",
    });

    // Fire-and-forget: deliverAdaptation runs the CV_GENERATION LLM call,
    // the heaviest of the 4 operations converted to async — same pattern
    // already used by the webhook/reconciliation callers below. Awaiting it
    // here held the HTTP request open for the full generation time, risking
    // the same Cloudflare proxy timeout (~100s) that hit MASTERCV. The
    // response returns with status "paid"; frontend polls GET
    // /cv-adaptation/:id until status flips to "delivered".
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

    const secrets = getMercadoPagoWebhookSecrets();
    if (secrets.length === 0) return; // dev: sem secret configurado, aceita sem validar

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
    const receivedBuf = Buffer.from(v1);

    const matches = secrets.some((secret) => {
      const expected = createHmac("sha256", secret)
        .update(message)
        .digest("hex");
      const expectedBuf = Buffer.from(expected);
      return (
        expectedBuf.length === receivedBuf.length &&
        timingSafeEqual(expectedBuf, receivedBuf)
      );
    });

    if (!matches) {
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

    // Advance candidatura status to CV_READY synchronously before background tasks.
    await this.triggerJobApplicationHook({
      cvAdaptationId: adaptation.id,
      userId: adaptation.userId,
      jobTitle: adaptation.jobTitle,
      companyName: adaptation.companyName,
      jobDescriptionText: adaptation.jobDescriptionText,
      targetStatus: "CV_READY",
      origin: "optimized_cv_auto",
      callerMethod: "webhookPaymentApproved",
    });

    this.deliverAdaptation(adaptation.id).catch((err) => {
      this.logger.error(
        `[webhook:cv-adaptation] delivery failed for ${adaptation.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return { acknowledged: true };
  }

  private logAuditEvent(entry: AuditEntry): void {
    const sanitizedPayload = sanitizePaymentAuditPayload(entry.rawPayload);

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
          ...(sanitizedPayload != null
            ? { rawPayload: sanitizedPayload as Prisma.InputJsonValue }
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

  // Fallback de contato para geração de PDF/DOCX: preenche nome, telefone,
  // email e localização só quando o header gerado pela IA vier vazio nesses
  // campos — os dados estruturados do UserProfile são a fonte da verdade.
  private async resolveProfileContactFallback(userId: string) {
    const profile = await this.database.userProfile.findUnique({
      where: { userId },
      select: {
        fullName: true,
        phone: true,
        contactEmail: true,
        city: true,
        state: true,
        linkedinUrl: true,
      },
    });

    if (!profile) return null;

    return {
      fullName: profile.fullName,
      phone: profile.phone,
      email: profile.contactEmail,
      city: profile.city,
      state: profile.state,
      linkedinUrl: profile.linkedinUrl,
    };
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
    const output = this.resolveEffectiveCvOutput(
      (adaptation as { editedCvJson?: unknown }).editedCvJson,
      adaptation.adaptedContentJson,
      generatedOutput ?? adaptation.aiAuditJson,
    );
    // CvAdaptation.language is the single source of truth for this
    // candidacy's language (resolved once during analysis/adaptation) —
    // it always takes precedence over whatever the stored/edited CV JSON
    // carries, so downloads never re-detect language on their own.
    if (adaptation.language) {
      output.language = adaptation.language;
    }

    const profileFallback = await this.resolveProfileContactFallback(userId);
    const contactMode =
      adaptation.adaptationSource === "user_profile" ? "override" : "fallback";

    let pdfBuffer: Buffer;

    if (resolvedTemplateFileUrl?.endsWith(".docx")) {
      // DOCX template: fill with docxtemplater → convert via LibreOffice
      const docxBuffer = await this.docxService.generateDocx(
        output,
        resolvedTemplateFileUrl,
        profileFallback,
        contactMode,
      );
      pdfBuffer = await this.docxService.toPdf(docxBuffer);
    } else {
      // Legacy HTML template or no template
      pdfBuffer = await this.pdfService.generatePdf(
        output,
        resolvedStructureJson ?? resolvedTemplateSlug,
        profileFallback,
        contactMode,
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

    const profileFallback = await this.resolveProfileContactFallback(userId);

    const effectiveOutput = this.resolveEffectiveCvOutput(
      (adaptation as { editedCvJson?: unknown }).editedCvJson,
      adaptation.adaptedContentJson,
      generatedOutput ?? adaptation.aiAuditJson,
    );
    // CvAdaptation.language is the single source of truth for this
    // candidacy's language — takes precedence over the stored/edited CV JSON.
    if (adaptation.language) {
      effectiveOutput.language = adaptation.language;
    }

    const docxBuffer = await this.docxService.generateDocx(
      effectiveOutput,
      templateFileUrl ?? fallbackTemplate?.fileUrl ?? null,
      profileFallback,
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
      include: { masterResume: { select: { rawText: true } } },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (!adaptation.adaptedContentJson) {
      throw new BadRequestException("Adaptation analysis is not ready yet.");
    }

    // True legacy: there is no base CV text to generate sections from at all
    // (pre-dates the snapshot pipeline and has neither a master resume nor
    // enough guest-analysis data to synthesize one). Only this case should
    // ever prompt the user to redo the analysis — anything else with missing
    // sections is a transient generation issue, not a legacy record.
    const isLegacyFormat =
      !adaptation.analysisCvSnapshotId &&
      !adaptation.masterResume?.rawText?.trim() &&
      !this.synthesizeMasterCvTextFromGuestAnalysis(
        adaptation.adaptedContentJson,
      ).trim();

    // Start countByJob in background so it runs while CPU work happens below.
    const countPromise = this.countByJob(
      adaptation.jobTitle,
      adaptation.companyName,
    );

    const aiAudit = adaptation.aiAuditJson as Record<string, unknown> | null;
    const adaptationNotes =
      typeof aiAudit?.adaptationNotes === "string"
        ? aiAudit.adaptationNotes
        : null;

    const aiAuditHasSections =
      adaptation.aiAuditJson != null &&
      typeof adaptation.aiAuditJson === "object" &&
      "sections" in (adaptation.aiAuditJson as object);
    const adaptedContentHasSections =
      adaptation.adaptedContentJson != null &&
      typeof adaptation.adaptedContentJson === "object" &&
      "sections" in (adaptation.adaptedContentJson as object);

    // Only build finalCvOutput when real CV content is available.
    // If aiAuditJson is still being generated (null) and adaptedContentJson is
    // analysis JSON (no sections key), return null so the frontend keeps polling.
    const aiGeneratedOutput =
      aiAuditHasSections || adaptedContentHasSections
        ? this.toCvAdaptationOutput(
            adaptation.adaptedContentJson,
            adaptation.aiAuditJson,
          )
        : null;
    const editedCvJson = adaptation.editedCvJson as CvAdaptationOutput | null;
    const finalCvOutput = editedCvJson ?? aiGeneratedOutput;

    const sectionMapping = this.buildSectionMapping(
      adaptation.adaptedContentJson,
    );
    const enrichedAnalysis = this.enrichAjustesWithSelectedKeywords(
      adaptation.adaptedContentJson,
      finalCvOutput ?? undefined,
    );

    // If delivered but CV output is missing or has no displayable sections
    // (e.g. stripAiCustomSections wiped all "other" sections), fire a forced
    // regeneration. Pass aiAuditJson: null so ensureLegacyStructuredOutput
    // skips the early-return and rebuilds from scratch.
    const hasRealSections = (finalCvOutput?.sections ?? []).some(
      (s) =>
        typeof (s as { sectionType?: string }).sectionType === "string" &&
        (s as { sectionType: string }).sectionType !== "other",
    );
    if (
      adaptation.status === "delivered" &&
      (!finalCvOutput || !hasRealSections)
    ) {
      void this.database.cvAdaptation
        .findFirst({
          where: { id, userId },
          include: { masterResume: { select: { rawText: true } } },
        })
        .then((full) => {
          if (full) {
            return this.ensureLegacyStructuredOutput({
              ...full,
              masterResume: full.masterResume ?? { rawText: null },
              aiAuditJson: null, // force regeneration even when broken output already exists
            });
          }
        })
        .catch((err) => {
          console.error(
            `Retry CV generation for ${id}:`,
            err instanceof Error ? err.message : String(err),
          );
        });
    }

    return {
      adaptedContentJson: enrichedAnalysis,
      finalCvOutput,
      editedCvJson,
      sectionMapping,
      isLegacyFormat,
      paymentStatus: adaptation.paymentStatus,
      isUnlocked: adaptation.isUnlocked,
      status: adaptation.status,
      jobTitle: adaptation.jobTitle,
      companyName: adaptation.companyName,
      jobDescriptionText: adaptation.jobDescriptionText,
      adaptationNotes,
      jobApplicationId: adaptation.jobApplicationId,
      jobAnalysisCount: await countPromise,
    };
  }

  async resetCvContent(userId: string, id: string): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
      select: { isUnlocked: true },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (!adaptation.isUnlocked) {
      throw new BadRequestException("Adaptation is not unlocked.");
    }

    await this.database.cvAdaptation.update({
      where: { id },
      data: { editedCvJson: Prisma.DbNull },
    });
  }

  async saveReanalysisResult(
    userId: string,
    id: string,
    reanalysisResult: { adaptationId: string; score: number },
  ): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
      select: { isUnlocked: true, editedCvJson: true },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (!adaptation.isUnlocked) {
      throw new BadRequestException("Adaptation is not unlocked.");
    }

    const existing = (adaptation.editedCvJson ??
      {}) as Partial<CvAdaptationOutput>;
    const updated: CvAdaptationOutput = {
      summary: existing.summary ?? "",
      sections: existing.sections ?? [],
      highlightedSkills: existing.highlightedSkills ?? [],
      removedSections: existing.removedSections ?? [],
      adaptationNotes: existing.adaptationNotes,
      requirementAdaptationActions: existing.requirementAdaptationActions,
      reanalysisResult: {
        adaptationId: reanalysisResult.adaptationId,
        score: reanalysisResult.score,
        analyzedAt: new Date().toISOString(),
      },
    };

    await this.database.cvAdaptation.update({
      where: { id },
      data: { editedCvJson: updated as unknown as Prisma.InputJsonValue },
    });
  }

  async updateCvContent(
    userId: string,
    id: string,
    sections: CvAdaptationOutput["sections"],
    summary?: string,
  ): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
      select: { isUnlocked: true, aiAuditJson: true },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (!adaptation.isUnlocked) {
      throw new BadRequestException("Adaptation is not unlocked.");
    }

    const base = (adaptation.aiAuditJson ?? {}) as Partial<CvAdaptationOutput>;
    const editedCvJson: CvAdaptationOutput = {
      summary: summary ?? base.summary ?? "",
      sections,
      highlightedSkills: base.highlightedSkills ?? [],
      removedSections: base.removedSections ?? [],
      adaptationNotes: base.adaptationNotes,
    };

    await this.database.cvAdaptation.update({
      where: { id },
      data: { editedCvJson: editedCvJson as unknown as Prisma.InputJsonValue },
    });
  }

  private buildSectionMapping(
    adaptedContentJson: unknown,
  ): Record<string, string> {
    if (
      !adaptedContentJson ||
      typeof adaptedContentJson !== "object" ||
      Array.isArray(adaptedContentJson)
    ) {
      return {};
    }

    const content = adaptedContentJson as Record<string, unknown>;
    const ajustes = content.ajustes_conteudo as
      | Array<{ id?: string; titulo?: string; descricao?: string }>
      | undefined;
    if (!Array.isArray(ajustes)) return {};

    const mapping: Record<string, string> = {};
    for (const ajuste of ajustes) {
      const key = ajuste.id ?? ajuste.titulo;
      if (!key) continue;
      const text =
        `${ajuste.titulo ?? ""} ${ajuste.descricao ?? ""}`.toLowerCase();
      mapping[key] = this.inferSectionType(text);
    }
    return mapping;
  }

  private inferSectionType(text: string): string {
    if (
      /experiên|experi[eê]ncia|cargo|empresa|atua[çc]|profissional|trabalh|ocupa[çc]/.test(
        text,
      )
    ) {
      return "experience";
    }
    if (
      /habilidad|competên|skill|tecnolog|ferramenta|técni|stack|linguagem de program|framework/.test(
        text,
      )
    ) {
      return "skills";
    }
    if (
      /forma[çc][ãa]o|educa[çc]|curso|gradua[çc]|acad[eê]m|universid|faculdad|ensino|diploma/.test(
        text,
      )
    ) {
      return "education";
    }
    if (/resumo profis|objetivo|perfil|sobre m[iı]m|apresenta[çc]/.test(text)) {
      return "header";
    }
    if (/projeto|portf[oó]l/.test(text)) {
      return "projects";
    }
    if (/certifica[çc]|certific[aá]do/.test(text)) {
      return "certifications";
    }
    if (
      /idioma|l[iíì]ngua|ingl[eê]s|portugu[eê]s|espanhol|franc[eê]s/.test(text)
    ) {
      return "languages";
    }
    return "experience";
  }

  private async deliverAdaptation(adaptationId: string): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findUnique({
      where: { id: adaptationId },
      include: { masterResume: true, template: true },
    });

    if (!adaptation?.adaptedContentJson) {
      throw new Error("Adaptation not found or has no content");
    }

    const _output = adaptation.adaptedContentJson as CvAdaptationOutput;
    const _templateSlug = adaptation.template?.slug ?? "classico-simples";
    const _structureJson = (adaptation.template?.structureJson ??
      null) as TemplateStructureJson | null;

    // Create adapted Resume record
    const adaptedResume = await this.database.resume.create({
      data: {
        userId: adaptation.userId,
        title: `${adaptation.masterResume?.title ?? adaptation.jobTitle ?? "CV"} - Adaptado`,
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

    await this.triggerJobApplicationHook({
      cvAdaptationId: adaptationId,
      userId: adaptation.userId,
      jobTitle: adaptation.jobTitle,
      companyName: adaptation.companyName,
      jobDescriptionText: adaptation.jobDescriptionText,
      targetStatus: "CV_READY",
      origin: "optimized_cv_auto",
      callerMethod: "deliverAdaptation",
    });

    // Generate aiAuditJson (structured CV output) so it's ready before
    // deliverAdaptation resolves. Callers that await this method (the
    // synchronous claim/redeem flows) get real content before redirecting
    // the user; fire-and-forget callers (webhooks, reconciliation) are
    // unaffected since they don't await this method either.
    if (!adaptation.aiAuditJson) {
      await this.ensureLegacyStructuredOutput(adaptation).catch((err) => {
        console.error(
          `CV generation failed for ${adaptationId}:`,
          err instanceof Error ? err.message : String(err),
        );
        return null;
      });
    }
  }

  private async ensureAdaptedResumeRecord(adaptation: {
    id: string;
    userId: string;
    masterResumeId: string | null;
    adaptedResumeId: string | null;
    masterResume: { title: string } | null;
    jobTitle: string | null;
  }) {
    if (adaptation.adaptedResumeId) {
      return adaptation.adaptedResumeId;
    }

    const adaptedResume = await this.database.resume.create({
      data: {
        userId: adaptation.userId,
        title: `${adaptation.masterResume?.title ?? adaptation.jobTitle ?? "CV"} - Adaptado`,
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
    masterResumeId?: string | null;
    adaptationSource?: "uploaded_content" | "user_profile";
    inputMode?: "file_upload" | "text_paste" | "profile";
    generationInputSnapshotJson?: unknown;
    masterResume: { rawText: string | null } | null;
  }): Promise<CvAdaptationOutput | null> {
    if (
      adaptation.aiAuditJson &&
      typeof adaptation.aiAuditJson === "object" &&
      "summary" in adaptation.aiAuditJson &&
      "sections" in adaptation.aiAuditJson
    ) {
      return adaptation.aiAuditJson as CvAdaptationOutput;
    }

    // Deduplicate: only one generation attempt per adaptation at a time
    if (this.cvGenerationInProgress.has(adaptation.id)) {
      this.logger.debug(
        `CV generation already in progress for ${adaptation.id}, skipping duplicate call`,
      );
      return null;
    }

    this.cvGenerationInProgress.add(adaptation.id);

    try {
      const masterCvText = await this.resolveGenerationMasterCvText(adaptation);

      if (!masterCvText) {
        this.logger.warn(
          `No master CV text available for adaptation ${adaptation.id}`,
        );
        return null;
      }

      await this.persistGenerationSnapshotIfMissing(adaptation, masterCvText);

      const requirementCoverage = this.extractRequirementCoverageFromAnalysis(
        adaptation.adaptedContentJson,
      );
      const ajustesConteudo = this.extractAjustesConteudoFromAnalysis(
        adaptation.adaptedContentJson,
      );

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
            requirementCoverage,
            ajustesConteudo,
            selectedMissingKeywords: this.mergeKeywordsForGeneration(
              this.getSelectedMissingKeywords(adaptation.adaptedContentJson),
              this.getPossiveisKeywords(adaptation.adaptedContentJson),
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
        this.logger.error(
          `LLM generation returned not-ok for adaptation ${adaptation.id}`,
        );
        return null;
      }

      const output = protectionResult.result;

      await this.database.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          aiAuditJson: output as unknown as Prisma.InputJsonValue,
          language: output.language,
        },
      });

      this.logger.log(
        `aiAuditJson saved successfully for adaptation ${adaptation.id}`,
      );

      return output;
    } catch (err) {
      this.logger.error(
        `CV generation failed for adaptation ${adaptation.id}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      return null;
    } finally {
      this.cvGenerationInProgress.delete(adaptation.id);
    }
  }

  private buildContentSha256(text: string): string {
    return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  }

  private buildAnalysisInputSnapshot(input: {
    adaptationSource: "uploaded_content" | "user_profile";
    inputMode: "file_upload" | "text_paste" | "profile";
    masterCvText: string;
    masterResumeId: string;
  }) {
    return {
      adaptationSource: input.adaptationSource,
      contentSha256: this.buildContentSha256(input.masterCvText),
      inputMode: input.inputMode,
      resumeRef: { resumeId: input.masterResumeId },
      stage: "analysis",
      structuredInput: {
        hasContent: true,
      },
    };
  }

  private buildUploadedContentSnapshot(input: {
    inputMode: "file_upload" | "text_paste" | "profile";
    masterCvText: string;
    masterResumeId: string;
  }) {
    return {
      contentSha256: this.buildContentSha256(input.masterCvText),
      inputMode: input.inputMode,
      resumeRef: { resumeId: input.masterResumeId },
      stage: "uploaded_content",
    };
  }

  private async persistGenerationSnapshotIfMissing(
    adaptation: {
      id: string;
      jobDescriptionText: string;
      jobTitle: string | null;
      companyName: string | null;
      masterResumeId?: string | null;
      adaptationSource?: "uploaded_content" | "user_profile";
      inputMode?: "file_upload" | "text_paste" | "profile";
      generationInputSnapshotJson?: unknown;
    },
    masterCvText: string,
  ) {
    if (adaptation.generationInputSnapshotJson) {
      return;
    }

    const snapshot = {
      adaptationSource: adaptation.adaptationSource ?? "uploaded_content",
      contentSha256: this.buildContentSha256(masterCvText),
      inputMode: adaptation.inputMode ?? "file_upload",
      masterResumeRef: adaptation.masterResumeId
        ? { resumeId: adaptation.masterResumeId }
        : null,
      stage: "generation",
      structuredInput: {
        companyName: adaptation.companyName,
        jobDescriptionLength: adaptation.jobDescriptionText.length,
        jobTitle: adaptation.jobTitle,
      },
    };

    if (typeof this.database.cvAdaptation.updateMany === "function") {
      await this.database.cvAdaptation.updateMany({
        where: {
          id: adaptation.id,
          generationInputSnapshotJson: { equals: Prisma.AnyNull },
        },
        data: {
          generationInputSnapshotJson: snapshot as Prisma.InputJsonValue,
        },
      });
      return;
    }

    await this.database.cvAdaptation.update({
      where: { id: adaptation.id },
      data: { generationInputSnapshotJson: snapshot as Prisma.InputJsonValue },
    });
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

  private getPossiveisKeywords(adaptedContentJson: unknown): string[] {
    if (!adaptedContentJson || typeof adaptedContentJson !== "object") {
      return [];
    }

    const keywords = (adaptedContentJson as { keywords?: unknown }).keywords;
    if (!keywords || typeof keywords !== "object") return [];

    const possiveis = (keywords as { possiveis?: unknown }).possiveis;
    if (!Array.isArray(possiveis)) return [];

    return possiveis
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object",
      )
      .map((item) => String(item.kw ?? "").trim())
      .filter((kw) => kw.length > 0);
  }

  private mergeKeywordsForGeneration(
    selectedMissingKeywords: string[],
    possiveisKeywords: string[],
  ): string[] {
    const seen = new Set(
      selectedMissingKeywords.map((kw) => kw.toLowerCase().trim()),
    );
    const merged = [...selectedMissingKeywords];
    for (const kw of possiveisKeywords) {
      if (!seen.has(kw.toLowerCase().trim())) {
        seen.add(kw.toLowerCase().trim());
        merged.push(kw);
      }
    }
    return merged.slice(0, 80);
  }

  private enrichAjustesWithSelectedKeywords(
    adaptedContentJson: unknown,
    cvOutput?: CvAdaptationOutput,
  ): unknown {
    if (!adaptedContentJson || typeof adaptedContentJson !== "object") {
      return adaptedContentJson;
    }

    const json = adaptedContentJson as Record<string, unknown>;

    // Build CV full-text for keyword presence check
    const cvFullText = cvOutput
      ? [
          cvOutput.summary ?? "",
          ...(cvOutput.sections ?? []).flatMap((s) => [
            s.title,
            ...s.items.flatMap((i) => [
              i.heading ?? "",
              i.subheading ?? "",
              ...(i.bullets ?? []),
            ]),
          ]),
        ]
          .join(" ")
          .toLowerCase()
      : "";
    const kwInCv = (kw: string) =>
      cvFullText.length > 0 && cvFullText.includes(kw.toLowerCase().trim());

    const selectedKws = Array.isArray(json.selectedMissingKeywords)
      ? (json.selectedMissingKeywords as unknown[]).filter(
          (k): k is string => typeof k === "string" && k.trim().length > 0,
        )
      : [];

    const kwPossiveisRawEarly = (
      json.keywords as Record<string, unknown> | undefined
    )?.possiveis;
    if (!selectedKws.length && !Array.isArray(kwPossiveisRawEarly)) {
      return adaptedContentJson;
    }

    // Build pontos lookup from keywords.ausentes (authoritative source for kw points)
    const kwPontosMap = new Map<string, number>();
    const kwAusentesRaw = (json.keywords as Record<string, unknown> | undefined)
      ?.ausentes;
    if (Array.isArray(kwAusentesRaw)) {
      for (const item of kwAusentesRaw as Record<string, unknown>[]) {
        if (typeof item.kw === "string" && typeof item.pontos === "number") {
          kwPontosMap.set(item.kw.toLowerCase().trim(), item.pontos);
        }
      }
    }

    // Normalize helper: remove accents + lowercase for loose matching
    const norm = (s: string) =>
      s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

    const existingAjustes = Array.isArray(json.ajustes_conteudo)
      ? (json.ajustes_conteudo as Record<string, unknown>[])
      : [];

    // Build normalized title/id index of existing ajustes
    const existingNormMap = new Map<string, number>(); // normKey → index in existingAjustes
    existingAjustes.forEach((a, i) => {
      existingNormMap.set(norm(String(a.titulo ?? "")), i);
      existingNormMap.set(norm(String(a.id ?? "")), i);
    });

    // Patch existing ajustes that match selected keywords with correct pontos
    const patchedAjustes = existingAjustes.map((a) => ({ ...a }));
    const coveredKws = new Set<string>();

    for (const kw of selectedKws) {
      const kwNorm = norm(kw);
      const idx = existingNormMap.get(kwNorm);
      if (idx !== undefined) {
        const correctPontos =
          kwPontosMap.get(kw.toLowerCase().trim()) ??
          kwPontosMap.get(kwNorm) ??
          (patchedAjustes[idx].pontos as number | undefined);
        if (typeof correctPontos === "number") {
          patchedAjustes[idx] = {
            ...patchedAjustes[idx],
            pontos: correctPontos,
          };
        }
        coveredKws.add(kwNorm);
      }
    }

    // Add new entries for selected keywords not already covered
    const newKwAjustes = selectedKws
      .filter((kw) => !coveredKws.has(norm(kw)))
      .map((kw) => ({
        id: norm(kw)
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, ""),
        titulo: kw,
        descricao: `Keyword "${kw}" incluída no CV adaptado.`,
        pontos:
          kwPontosMap.get(kw.toLowerCase().trim()) ??
          kwPontosMap.get(norm(kw)) ??
          1,
        dica: `A keyword "${kw}" foi adicionada onde mais se encaixa no CV.`,
        categoria: "keywords_incluidas",
        coveragePercent: kwInCv(kw) ? 100 : 0,
      }));

    // Add keywords.possiveis (LLM-suggested keywords with real basis)
    const kwPossiveisRaw = (
      json.keywords as Record<string, unknown> | undefined
    )?.possiveis;
    const allNormIds = new Set([
      ...patchedAjustes.map((a) => norm(String(a.titulo ?? ""))),
      ...newKwAjustes.map((a) => norm(String(a.titulo ?? ""))),
    ]);
    const possiveisAjustes = Array.isArray(kwPossiveisRaw)
      ? (kwPossiveisRaw as Record<string, unknown>[])
          .filter(
            (item) =>
              typeof item.kw === "string" &&
              item.kw.trim().length > 0 &&
              !allNormIds.has(norm(item.kw as string)),
          )
          .map((item) => ({
            id: norm(item.kw as string)
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, ""),
            titulo: item.kw as string,
            descricao: `Keyword incluída pela IA com base em contexto real do CV.`,
            pontos: typeof item.pontos === "number" ? item.pontos : 1,
            dica: `"${item.kw}" foi inserida onde melhor se encaixa no CV adaptado.`,
            categoria: "keywords_incluidas",
            coveragePercent: kwInCv(item.kw as string) ? 100 : 0,
          }))
      : [];

    return {
      ...json,
      ajustes_conteudo: [
        ...patchedAjustes,
        ...newKwAjustes,
        ...possiveisAjustes,
      ],
    };
  }

  private extractAjustesConteudoFromAnalysis(
    adaptedContentJson: unknown,
  ): Array<{
    id: string;
    titulo: string;
    categoria: "keywords_incluidas" | "texto_reescrito" | "ajuste_conteudo";
  }> {
    const VALID_CATEGORIAS = new Set([
      "keywords_incluidas",
      "texto_reescrito",
      "ajuste_conteudo",
    ]);

    if (!adaptedContentJson || typeof adaptedContentJson !== "object") {
      return [];
    }

    const raw = (adaptedContentJson as { ajustes_conteudo?: unknown })
      .ajustes_conteudo;

    if (!Array.isArray(raw)) return [];

    return raw
      .filter(
        (a): a is Record<string, unknown> =>
          a !== null && typeof a === "object",
      )
      .filter((a) => typeof a.titulo === "string")
      .map((a) => ({
        id: typeof a.id === "string" && a.id ? a.id : String(a.titulo).trim(),
        titulo: String(a.titulo).trim(),
        categoria: (VALID_CATEGORIAS.has(a.categoria as string)
          ? a.categoria
          : "ajuste_conteudo") as
          | "keywords_incluidas"
          | "texto_reescrito"
          | "ajuste_conteudo",
      }))
      .slice(0, 50);
  }

  private extractRequirementCoverageFromAnalysis(
    adaptedContentJson: unknown,
  ): JobRequirementCoverage[] | undefined {
    if (!adaptedContentJson || typeof adaptedContentJson !== "object") {
      return undefined;
    }

    const raw = (adaptedContentJson as { requirements?: unknown }).requirements;

    if (!Array.isArray(raw) || raw.length === 0) {
      return undefined;
    }

    const valid = raw.filter(
      (r): r is JobRequirementCoverage =>
        r !== null &&
        typeof r === "object" &&
        typeof (r as JobRequirementCoverage).requirementKey === "string" &&
        typeof (r as JobRequirementCoverage).coverageStatus === "string",
    );

    return valid.length > 0 ? valid : undefined;
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

  private stripAiCustomSections(
    output: CvAdaptationOutput,
  ): CvAdaptationOutput {
    return {
      ...output,
      sections: (output.sections ?? []).filter(
        (s) => s.sectionType !== "other",
      ),
    };
  }

  private async mergeCanonicalProfileFromText(input: {
    userId: string;
    text: string;
    source: "analysis_upload" | "base_cv_upload";
    sourceCvId?: string | null;
  }): Promise<void> {
    if (
      !this.database.userProfile ||
      typeof this.database.userProfile.findUnique !== "function" ||
      typeof this.database.userProfile.update !== "function"
    ) {
      return;
    }

    if (typeof this.profileMergeService?.merge !== "function") {
      return;
    }

    if (typeof this.profileReadinessService?.compute !== "function") {
      return;
    }

    const profile = await this.database.userProfile.findUnique({
      where: { userId: input.userId },
    });

    if (!profile) {
      return;
    }

    const incoming = this.extractCanonicalProfileFromText(input.text);
    if (!this.hasAnyCanonicalValue(incoming)) {
      return;
    }

    const existing = this.mapProfileRecordToCanonicalData(profile);
    const fieldMeta = this.parseFieldMeta(profile.profileFieldMetaJson);
    const suggestions = this.parseSuggestions(profile.profileSuggestionsJson);

    const merged = this.profileMergeService.merge({
      existing,
      incoming,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
    });

    const readiness = this.profileReadinessService.compute({
      ...merged.next,
      experiences: merged.next.experiences ?? [],
      education: merged.next.education ?? [],
      skills: merged.next.skills ?? { technical: [], business: [], soft: [] },
      languages: merged.next.languages ?? [],
      certifications: merged.next.certifications ?? [],
    });

    await this.database.userProfile.update({
      where: { userId: input.userId },
      data: {
        city: merged.next.city ?? profile.city,
        country: merged.next.country ?? profile.country,
        experiencesJson: (merged.next.experiences ??
          []) as Prisma.InputJsonValue,
        fullName: merged.next.fullName ?? profile.fullName,
        headline: merged.next.headline ?? profile.headline,
        linkedinUrl: merged.next.linkedinUrl ?? profile.linkedinUrl,
        phone: merged.next.phone ?? profile.phone,
        professionalSummary:
          merged.next.professionalSummary ?? profile.professionalSummary,
        profileFieldMetaJson: merged.fieldMeta as Prisma.InputJsonValue,
        profileReadinessStatus: readiness,
        profileSuggestionsJson: merged.suggestions as Prisma.InputJsonValue,
        skillsJson: (merged.next.skills ?? {
          technical: [],
          business: [],
          soft: [],
        }) as Prisma.InputJsonValue,
        state: merged.next.state ?? profile.state,
      },
    });
  }

  private extractCanonicalProfileFromText(
    text: string,
  ): Partial<CanonicalProfileData> {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const firstLine = lines[0];
    const phoneMatch = text.match(
      /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/,
    );
    const linkedinMatch = text.match(
      /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_.%]+\/?/i,
    );

    const skills = this.extractSkillsFromText(text);

    return {
      fullName:
        firstLine && /^[A-Za-zÀ-ÖØ-öø-ÿ'\-\s]{3,80}$/.test(firstLine)
          ? firstLine
          : undefined,
      headline: lines[1],
      linkedinUrl: linkedinMatch?.[0],
      phone: phoneMatch?.[0],
      professionalSummary: lines.slice(2, 6).join(" ").slice(0, 400),
      skills,
    };
  }

  private extractSkillsFromText(text: string): CanonicalProfileData["skills"] {
    const lowered = text.toLowerCase();
    const known = [
      "sql",
      "python",
      "excel",
      "power bi",
      "tableau",
      "javascript",
      "typescript",
      "aws",
      "airflow",
      "dbt",
    ];

    const technical = known.filter((skill) => lowered.includes(skill));

    return {
      technical,
      business: [],
      soft: [],
    };
  }

  private hasAnyCanonicalValue(data: Partial<CanonicalProfileData>): boolean {
    return Boolean(
      data.fullName ||
        data.headline ||
        data.professionalSummary ||
        data.phone ||
        data.linkedinUrl ||
        data.city ||
        data.state ||
        data.country ||
        (data.skills &&
          (data.skills.technical.length > 0 ||
            data.skills.business.length > 0 ||
            data.skills.soft.length > 0)),
    );
  }

  private mapProfileRecordToCanonicalData(profile: {
    fullName: string | null;
    contactEmail: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    headline: string | null;
    professionalSummary: string | null;
    experiencesJson: unknown;
    educationJson: unknown;
    skillsJson: unknown;
    languagesJson?: unknown;
    certificationsJson?: unknown;
  }): CanonicalProfileData {
    const parsedSkills = this.parseRecord(profile.skillsJson) as {
      technical?: unknown;
      business?: unknown;
      soft?: unknown;
    };

    return {
      city: profile.city ?? undefined,
      contactEmail: profile.contactEmail ?? undefined,
      country: profile.country ?? undefined,
      education: this.parseEducationArray(profile.educationJson),
      experiences: this.parseExperienceArray(profile.experiencesJson),
      fullName: profile.fullName ?? undefined,
      headline: profile.headline ?? undefined,
      linkedinUrl: profile.linkedinUrl ?? undefined,
      phone: profile.phone ?? undefined,
      professionalSummary: profile.professionalSummary ?? undefined,
      skills: {
        business: this.parseStringArray(parsedSkills.business),
        soft: this.parseStringArray(parsedSkills.soft),
        technical: this.parseStringArray(parsedSkills.technical),
      },
      state: profile.state ?? undefined,
      languages: this.parseArray(
        profile.languagesJson,
      ) as CanonicalProfileData["languages"],
      certifications: this.parseArray(
        profile.certificationsJson,
      ) as CanonicalProfileData["certifications"],
    };
  }

  // Modo "perfil" (inputMode: profile) precisa vir sempre dos campos
  // estruturados do UserProfile, nunca de Resume.rawText — resolvido em
  // 2026-07-18 após bug reportado onde editar cidade/estado no CV Base não
  // tinha efeito nenhum na análise/geração, já que o texto usado no modo
  // perfil vinha só do arquivo originalmente enviado, nunca do perfil.
  private async resolveProfileMasterCvText(userId: string): Promise<string> {
    const profile = await this.database.userProfile.findUnique({
      where: { userId },
    });

    const canonical = profile
      ? this.mapProfileRecordToCanonicalData(profile)
      : null;

    if (!canonical || !this.hasAnyCanonicalValue(canonical)) {
      throw new BadRequestException(
        "Complete seu CV Base antes de usar o modo perfil.",
      );
    }

    return this.renderCanonicalProfileToText(canonical);
  }

  private renderCanonicalProfileToText(data: CanonicalProfileData): string {
    const lines: string[] = [];

    if (data.fullName) lines.push(data.fullName);
    if (data.headline) lines.push(data.headline);

    const location = [data.city, data.state, data.country]
      .filter((v) => v?.trim())
      .join(", ");
    const contactLine = [
      location,
      data.phone,
      data.contactEmail,
      data.linkedinUrl,
    ]
      .filter((v) => v?.trim())
      .join(" | ");
    if (contactLine) lines.push(contactLine);

    if (data.professionalSummary) {
      lines.push("", "Resumo", data.professionalSummary);
    }

    if (data.experiences.length > 0) {
      lines.push("", "Experiência");
      for (const exp of data.experiences) {
        const dateRange = [exp.startDate, exp.isCurrent ? "Atual" : exp.endDate]
          .filter((v) => v?.trim())
          .join(" - ");
        const header = [
          [exp.role, exp.company].filter((v) => v?.trim()).join(" — "),
          dateRange,
        ]
          .filter((v) => v?.trim())
          .join(" | ");
        if (header) lines.push(header);
        if (exp.description) lines.push(exp.description);
        for (const achievement of exp.achievements ?? []) {
          if (achievement?.trim()) lines.push(`- ${achievement}`);
        }
      }
    }

    if (data.education.length > 0) {
      lines.push("", "Formação");
      for (const edu of data.education) {
        const dateRange = [edu.startDate, edu.endDate]
          .filter((v) => v?.trim())
          .join(" - ");
        const header = [
          [edu.degree, edu.fieldOfStudy].filter((v) => v?.trim()).join(" em "),
          edu.institution,
          dateRange,
        ]
          .filter((v) => v?.trim())
          .join(" | ");
        if (header) lines.push(header);
        if (edu.description) lines.push(edu.description);
      }
    }

    const allSkills = [
      ...data.skills.technical,
      ...data.skills.business,
      ...data.skills.soft,
    ].filter((v) => v?.trim());
    if (allSkills.length > 0) {
      lines.push("", "Competências", allSkills.join(", "));
    }

    if (data.languages.length > 0) {
      lines.push("", "Idiomas");
      for (const lang of data.languages) {
        lines.push(
          [lang.language, lang.level].filter((v) => v?.trim()).join(" - "),
        );
      }
    }

    if (data.certifications.length > 0) {
      lines.push("", "Certificações");
      for (const cert of data.certifications) {
        lines.push(
          [cert.name, cert.issuer, cert.year]
            .filter((v) => v?.trim())
            .join(" - "),
        );
      }
    }

    return lines.join("\n").trim();
  }

  private parseArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private parseExperienceArray(
    value: unknown,
  ): CanonicalProfileData["experiences"] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is CanonicalProfileData["experiences"][number] =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string",
    );
  }

  private parseEducationArray(
    value: unknown,
  ): CanonicalProfileData["education"] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is CanonicalProfileData["education"][number] =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string",
    );
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string");
  }

  private parseRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private parseFieldMeta(value: unknown): Record<
    string,
    {
      source: "analysis_upload" | "base_cv_upload" | "manual_edit";
      manuallyEdited?: boolean;
      lastEditedAt?: string;
      sourceCvId?: string | null;
    }
  > {
    const record = this.parseRecord(value);
    const parsed: Record<
      string,
      {
        source: "analysis_upload" | "base_cv_upload" | "manual_edit";
        manuallyEdited?: boolean;
        lastEditedAt?: string;
        sourceCvId?: string | null;
      }
    > = {};

    for (const [key, entry] of Object.entries(record)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const source = (entry as { source?: unknown }).source;
      if (
        source !== "analysis_upload" &&
        source !== "base_cv_upload" &&
        source !== "manual_edit"
      ) {
        continue;
      }

      parsed[key] = {
        source,
        manuallyEdited:
          typeof (entry as { manuallyEdited?: unknown }).manuallyEdited ===
          "boolean"
            ? ((entry as { manuallyEdited: boolean }).manuallyEdited as boolean)
            : undefined,
        lastEditedAt:
          typeof (entry as { lastEditedAt?: unknown }).lastEditedAt === "string"
            ? ((entry as { lastEditedAt: string }).lastEditedAt as string)
            : undefined,
        sourceCvId:
          typeof (entry as { sourceCvId?: unknown }).sourceCvId === "string" ||
          (entry as { sourceCvId?: unknown }).sourceCvId === null
            ? ((entry as { sourceCvId?: string | null }).sourceCvId ?? null)
            : undefined,
      };
    }

    return parsed;
  }

  private parseSuggestions(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (
        item,
      ): item is {
        fieldPath: string;
        currentValue: unknown;
        suggestedValue: unknown;
        status: "pending" | "accepted" | "rejected";
        source: "analysis_upload" | "base_cv_upload" | "manual_edit";
        sourceCvId?: string | null;
        createdAt: string;
      } => typeof item === "object" && item !== null,
    );
  }

  private resolveEffectiveCvOutput(
    editedCvJson: unknown,
    adaptedContentJson: unknown,
    aiAuditJson?: unknown,
  ): CvAdaptationOutput {
    if (
      editedCvJson &&
      typeof editedCvJson === "object" &&
      "sections" in editedCvJson &&
      Array.isArray((editedCvJson as { sections: unknown }).sections)
    ) {
      return this.filterEmptySections(editedCvJson as CvAdaptationOutput);
    }
    return this.toCvAdaptationOutput(adaptedContentJson, aiAuditJson);
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
      return this.stripAiCustomSections(
        this.filterEmptySections(aiAuditJson as CvAdaptationOutput),
      );
    }

    if (
      adaptedContentJson &&
      typeof adaptedContentJson === "object" &&
      "summary" in adaptedContentJson &&
      "sections" in adaptedContentJson
    ) {
      return this.stripAiCustomSections(
        this.filterEmptySections(adaptedContentJson as CvAdaptationOutput),
      );
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

  private async mapFileExtractionError(
    error: unknown,
    telemetry?: {
      context: AnalysisRequestContext & { routeKey: string };
      file?: FileUpload;
      routeKey: string;
    },
  ): Promise<never> {
    const emitTelemetry = async (reason: string) => {
      if (!telemetry?.context) {
        return;
      }

      await this.analysisTelemetry
        .emit("payload_invalid", telemetry.context, {
          metadata: {
            fileExtension: telemetry.file?.originalname.includes(".")
              ? `.${telemetry.file.originalname.split(".").pop()?.toLowerCase() ?? ""}`
              : null,
            fileSizeBytes: telemetry.file?.size ?? null,
            mimeType: telemetry.file?.mimetype ?? null,
            reason,
          },
          routeKey: telemetry.routeKey,
        })
        .catch(() => undefined);
    };

    if (error instanceof Error) {
      if (error.name === "InvalidPdfFormatError") {
        await emitTelemetry("upload_invalid_pdf_signature");
        this.logger.warn("[cv-validation] invalid PDF signature/content");
        throw new BadRequestException(
          "O arquivo enviado nao e um PDF valido. Exporte o curriculo novamente em PDF e tente de novo.",
        );
      }
      if (error.name === "PdfTooLargeError") {
        await emitTelemetry("upload_pdf_too_large");
        this.logger.warn("[cv-validation] PDF exceeds maximum size");
        throw new BadRequestException(
          "O arquivo excede o limite de 5 MB. Envie uma versao menor do PDF.",
        );
      }
      if (error.name === "PdfTooManyPagesError") {
        await emitTelemetry("upload_pdf_too_many_pages");
        this.logger.warn("[cv-validation] PDF exceeds maximum page limit");
        throw new BadRequestException(
          "O PDF possui paginas demais para analise automatica. Envie uma versao reduzida do curriculo.",
        );
      }
      if (error.name === "CvFileTooLargeError") {
        await emitTelemetry("upload_file_too_large");
        this.logger.warn("[cv-validation] CV file exceeds maximum size");
        throw new BadRequestException(
          "O arquivo excede o limite de 5 MB. Envie uma versao menor do CV.",
        );
      }
      if (error.name === "CvExtractionTimeoutError") {
        await emitTelemetry("parser_timeout");
        this.logger.warn("[cv-validation] CV extraction timed out");
        throw new BadRequestException(
          "Nao foi possivel processar o arquivo dentro do tempo limite. Tente novamente com um arquivo menor.",
        );
      }
      if (error.name === "InvalidDocxFileError") {
        await emitTelemetry("upload_invalid_docx_structure");
        this.logger.warn("[cv-validation] invalid DOCX structure/signature");
        throw new BadRequestException(
          "O arquivo DOCX enviado parece invalido ou corrompido. Exporte novamente e tente de novo.",
        );
      }
      if (error.name === "InvalidOdtFileError") {
        await emitTelemetry("upload_invalid_odt_structure");
        this.logger.warn("[cv-validation] invalid ODT structure/signature");
        throw new BadRequestException(
          "O arquivo ODT enviado parece invalido ou corrompido. Exporte novamente e tente de novo.",
        );
      }
      if (error.name === "NotACvError") {
        await emitTelemetry("upload_not_a_cv");
        this.logger.warn(
          "[cv-validation] uploaded file does not look like a CV",
        );
        throw new BadRequestException(
          "O arquivo enviado nao parece ser um curriculo. Envie um CV em PDF, DOCX ou ODT para analise.",
        );
      }
      if (error.name === "ScannedPdfError") {
        await emitTelemetry("upload_pdf_no_text");
        this.logger.warn(
          "[cv-validation] PDF has no extractable text (scanned/image)",
        );
        throw new BadRequestException(
          "Não conseguimos ler o texto do PDF. Envie um arquivo com texto selecionável.",
        );
      }
      await emitTelemetry("upload_extraction_failed");
      this.logger.warn(
        `[cv-validation] file extraction failed: ${error.message}`,
      );
    }
    await emitTelemetry("upload_extraction_failed");
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

  // Prova de posse real de uma AnalysisJob guest — jobId (cuid) sozinho
  // identifica a análise, mas nunca autentica posse dela; só quem recebeu
  // o guestPossessionToken cru na resposta de analyze-guest consegue
  // passar aqui. Comparação em tempo constante via possessionTokenMatchesHash
  // (mesmo padrão já usado para assinatura de webhook em
  // verifyWebhookSignature) para não vazar o hash por diferença de timing.
  // Job já convertido (claimed) também falha aqui deliberadamente — uma vez
  // vinculado a um usuário, o token de posse guest deixa de valer como
  // credencial (o dono passa a ser o userId, não mais o token).
  async verifyGuestPossessionToken(
    jobId: string,
    rawToken: string,
  ): Promise<boolean> {
    if (!jobId || !rawToken) return false;

    const job = await this.database.analysisJob.findUnique({
      where: { id: jobId },
      select: {
        ownerKind: true,
        guestPossessionTokenHash: true,
        convertedAt: true,
      },
    });

    if (
      !job ||
      job.ownerKind !== "guest" ||
      !job.guestPossessionTokenHash ||
      job.convertedAt
    ) {
      return false;
    }

    return possessionTokenMatchesHash(rawToken, job.guestPossessionTokenHash);
  }

  private getSnapshotEnforcementReleaseDate() {
    return new Date("2026-04-29T14:30:00.000Z");
  }

  private buildSnapshotProfessionalProfile(text: string) {
    const normalizedText = this.normalizeSnapshotText(text);
    const lines = normalizedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const highlights = lines.filter((line) => line.length >= 8).slice(0, 24);

    const profile = {
      version: "fallback_v1",
      textPreview: normalizedText.slice(0, 4_000),
      textLength: normalizedText.length,
      highlights,
    } satisfies Prisma.InputJsonObject;

    return {
      fingerprint: createHash("sha256").update(normalizedText).digest("hex"),
      profile,
    };
  }

  private async createAnalysisCvSnapshot(input: {
    userId: string | null;
    guestSessionHash: string | null;
    sourceType:
      | "text_input"
      | "uploaded_file"
      | "master_resume"
      | "user_profile";
    text: string;
    file?: FileUpload;
  }) {
    const normalizedText = this.normalizeSnapshotText(input.text);
    const professionalProfile =
      this.buildSnapshotProfessionalProfile(normalizedText);
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
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const snapshot = await this.database.analysisCvSnapshot.create({
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
        professionalProfileFingerprint: professionalProfile.fingerprint,
        professionalProfileJson: professionalProfile.profile,
        expiresAt,
      },
    });

    // Fire-and-forget: popula a Base de Talentos (EarlySignal) em segundo
    // plano. Nunca aguardado e nunca deve afetar esta análise — ver
    // talent-profiles/talent-profile-capture.service.ts.
    this.talentProfileCapture.captureFromSnapshot({
      snapshotId: snapshot.id,
      userId: snapshot.userId,
      sourceType: snapshot.sourceType,
      text: normalizedText,
    });

    return snapshot;
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
          originalFileName: string | null;
        } | null>;
        update: (args: {
          where: { id: string };
          data: {
            claimedAt: Date;
            claimedByUserId: string;
          };
        }) => Promise<{ id: string; originalFileName: string | null }>;
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
    masterResume: { rawText: string | null } | null;
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
      adaptation.masterResume?.rawText?.trim() ||
      this.synthesizeMasterCvTextFromGuestAnalysis(
        adaptation.adaptedContentJson,
      )
    );
  }

  private validateJobDescription(
    text: string,
    telemetry?: {
      context: AnalysisRequestContext & { routeKey: string };
      routeKey: string;
    },
  ): string {
    const JOB_MIN_CHARS = 80;
    const JOB_MAX_CHARS = 12_000;
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

    const normalized = this.normalizeSnapshotText(text);

    const emitTelemetry = (reason: string) => {
      if (!telemetry?.context) {
        return;
      }

      void this.analysisTelemetry
        .emit("payload_invalid", telemetry.context, {
          metadata: {
            jobDescriptionLength: normalized.length,
            reason,
          },
          routeKey: telemetry.routeKey,
        })
        .catch(() => undefined);
    };

    if (!normalized || normalized.length < JOB_MIN_CHARS) {
      emitTelemetry("job_description_too_short");
      this.logger.warn("[cv-validation] job description too short");
      throw new BadRequestException(
        "O texto informado não parece uma descrição de vaga. Cole uma descrição válida para continuar.",
      );
    }

    if (normalized.length > JOB_MAX_CHARS) {
      emitTelemetry("job_description_too_long");
      this.logger.warn("[cv-validation] job description too long");
      throw new BadRequestException(
        "A descricao da vaga excede o limite de 12.000 caracteres.",
      );
    }

    const lower = normalized.toLowerCase();
    const hasSignal = JOB_SIGNALS.some((s) => lower.includes(s));
    if (!hasSignal) {
      emitTelemetry("job_description_invalid_format");
      this.logger.warn(
        "[cv-validation] job description does not look like a job posting",
      );
      throw new BadRequestException(
        "O texto informado não parece uma descrição de vaga. Cole uma descrição válida para continuar.",
      );
    }

    return normalized;
  }

  private validateCvTextInput(text: string): string {
    const normalized = this.normalizeSnapshotText(text);

    if (!normalized) {
      throw new BadRequestException("Digite o texto do seu CV.");
    }

    if (normalized.length < 120) {
      throw new BadRequestException(
        "O texto do CV está muito curto. Inclua mais detalhes antes de analisar.",
      );
    }

    const nonEmptyLines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (nonEmptyLines.length < 3) {
      throw new BadRequestException(
        "Organize o CV em mais linhas (resumo, experiências e competências, por exemplo).",
      );
    }

    const hasCommonCvSection =
      /(experi[eê]ncia|forma[cç][aã]o|habilidades|compet[eê]ncias|resumo|projetos|idiomas|certifica[cç][oõ]es)/i.test(
        normalized,
      );
    const hasDateSignal = /\b(19|20)\d{2}\b/.test(normalized);

    if (!hasCommonCvSection && !hasDateSignal) {
      throw new BadRequestException(
        "Esse texto não parece ser um currículo. Inclua seções como experiência, formação ou competências.",
      );
    }

    return normalized;
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

function getMercadoPagoWebhookSecrets(): string[] {
  const candidates = [
    process.env.MERCADOPAGO_PRO_WEBHOOK_SECRET,
    process.env.MERCADOPAGO_BRICK_WEBHOOK_SECRET,
    process.env.MERCADOPAGO_WEBHOOK_SECRET,
  ];

  return Array.from(
    new Set(
      candidates
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  );
}
