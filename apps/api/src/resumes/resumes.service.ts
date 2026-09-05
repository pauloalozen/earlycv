import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { type Prisma, ResumeKind } from "@prisma/client";
import type { Response } from "express";
import type { FileUpload } from "../cv-adaptation/dto/create-cv-adaptation.dto";
import { CvMasterPromotionService } from "../cv-processing/cv-master-promotion.service";
import { isCvStructuredProfilePipelineEnabled } from "../cv-processing/cv-processing.flags";
import { CvProcessingEntrypointService } from "../cv-processing/cv-processing-entrypoint.service";
import { DatabaseService } from "../database/database.service";
import { MasterCvCanonicalExtractionService } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.service";
import { StorageService } from "../storage/storage.service";
import type { CreateResumeDto } from "./dto/create-resume.dto";
import type {
  MasterCvExtractionCoverageDto,
  MasterCvExtractionStatusDto,
} from "./dto/master-cv-extraction-status.dto";
import type { UpdateResumeDto } from "./dto/update-resume.dto";

@Injectable()
export class ResumesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StorageService)
    private readonly storage: Pick<StorageService, "getObject" | "putObject">,
    @Optional()
    @Inject(MasterCvCanonicalExtractionService)
    private readonly masterCvCanonicalExtractionService?: Pick<
      MasterCvCanonicalExtractionService,
      "enqueueFromMasterResumeUpload"
    >,
    @Optional()
    @Inject(CvProcessingEntrypointService)
    private readonly cvProcessingEntrypoint?: Pick<
      CvProcessingEntrypointService,
      "enqueueFromUserText"
    >,
    // Fase 2G — set-primary integrado ao pipeline canônico (plano, seção
    // "Integrar POST /resumes/:id/set-primary"). @Optional() pelo mesmo
    // motivo de cvProcessingEntrypoint acima: nunca referenciado com a
    // flag desligada, mantendo os testes legados de set-primary intocados.
    @Optional()
    @Inject(CvMasterPromotionService)
    private readonly cvMasterPromotion?: Pick<
      CvMasterPromotionService,
      "promoteAndProject"
    >,
  ) {}

  list(userId: string) {
    return this.database.resume.findMany({
      where: { userId },
      orderBy: [{ isMaster: "desc" }, { updatedAt: "desc" }],
    });
  }

  async getById(userId: string, resumeId: string) {
    const resume = await this.database.resume.findFirst({
      where: {
        id: resumeId,
        userId,
      },
    });

    if (!resume) {
      throw new NotFoundException("resume not found");
    }

    return resume;
  }

  async getMasterCvExtractionStatus(
    userId: string,
  ): Promise<MasterCvExtractionStatusDto> {
    // Must reflect the extraction for the CURRENT upload (the most recently
    // created one), not "whichever extraction finished most recently" — a
    // replace upload creates a new pending/processing row while an older one
    // from a previous upload may already be "succeeded". Preferring the
    // already-finished one here made the frontend's polling see a false
    // "done" on the very first check and stop before the new extraction
    // (still running in the background) ever completed.
    const extraction =
      await this.database.masterCvCanonicalExtraction.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          coverageJson: true,
          updatedAt: true,
        },
      });

    if (!extraction) {
      return null;
    }

    return {
      status: extraction.status,
      extractionCoverage: this.parseExtractionCoverage(extraction.coverageJson),
      updatedAt: extraction.updatedAt.toISOString(),
    };
  }

  async create(
    userId: string,
    dto: CreateResumeDto,
    file?: FileUpload,
    turnstileToken?: string,
  ) {
    // Clearing the profile and uploading the replacement file used to be two
    // separate server actions (each triggering its own Next.js route
    // revalidation). That gap between the two round-trips raced with the
    // client-side polling that watches extraction status, leaving the screen
    // stuck on stale/empty data until a manual refresh. Folding the clear
    // into this same request removes that gap entirely.
    if (dto.clearExistingProfile) {
      await this.database.userProfile.updateMany({
        where: { userId },
        data: {
          fullName: null,
          contactEmail: null,
          phone: null,
          linkedinUrl: null,
          headline: null,
          city: null,
          state: null,
          country: null,
          professionalSummary: null,
          experiencesJson: [],
          educationJson: [],
          skillsJson: { technical: [], business: [], soft: [] },
          languagesJson: [],
          certificationsJson: [],
          profileReadinessStatus: "empty",
        },
      });
    }

    let sourceFileUrl: string | null = null;
    let extractedRawText: string | null = null;

    if (file) {
      if (!turnstileToken?.trim()) {
        throw new BadRequestException(
          "turnstileToken is required for master CV uploads",
        );
      }

      const key = `resumes/${userId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      sourceFileUrl = await this.storage.putObject(
        key,
        file.buffer,
        file.mimetype,
      );

      // Extract raw text from the file so the AI extraction step can use
      // plain text input, which works with any chat model and avoids
      // file_data format incompatibilities.
      try {
        const { extractTextFromCvFile } = await import(
          "../common/cv-text-extractor.js"
        );
        extractedRawText = await extractTextFromCvFile(file);
      } catch {
        // non-fatal — extraction will fall back to file-binary mode
      }
    } else if (dto.rawText?.trim()) {
      extractedRawText = dto.rawText.trim();
    }

    const createdResume = await this.database.$transaction(async (tx) => {
      const existingResumeCount = await tx.resume.count({ where: { userId } });
      const shouldBecomeMaster = dto.isPrimary ?? existingResumeCount === 0;

      if (shouldBecomeMaster) {
        // O CV master é um singleton: só existe UM ativo por vez, nunca um
        // histórico. Isso só é seguro apagar porque CvAdaptation.masterResumeId
        // agora é onDelete: SetNull (migration
        // 20260718160236_make_cv_adaptation_master_resume_optional) — apagar
        // o Resume nunca mais apaga a análise; ela sobrevive via
        // analysisCvSnapshot, que já é a fonte real do "CV usado na análise"
        // (ver createCvAdaptationResponseDto: canDownloadBaseCv/baseCvDownloadKind
        // dependem só do snapshot, nunca de masterResume). Antes disso era
        // Cascade e apagar aqui já destruiu análises reais — nunca reverter
        // essa premissa sem confirmar o onDelete atual da FK.
        const oldMasterResumes = await tx.resume.findMany({
          where: { userId, kind: ResumeKind.master },
          select: { id: true },
        });
        for (const old of oldMasterResumes) {
          // Resumes "adaptados" derivados do master antigo (basedOnResumeId)
          // também precisam ser apagados aqui: a constraint
          // Resume_adapted_requires_context_check exige templateId/targetJob*
          // OU basedOnResumeId — um SetNull simples os deixaria órfãos e
          // inválidos. O conteúdo real do CV adaptado não mora nesse resume
          // (é placeholder, recriado sob demanda por ensureAdaptedResumeRecord)
          // — o que baixa pro usuário vem de CvAdaptation.adaptedContentJson.
          await tx.resume.deleteMany({
            where: { userId, basedOnResumeId: old.id },
          });
        }
        await tx.resume.deleteMany({
          where: {
            userId,
            id: { in: oldMasterResumes.map((resume) => resume.id) },
          },
        });
        await this.demoteOtherResumes(tx, userId);
      }

      const createdResume = await tx.resume.create({
        data: {
          userId,
          title: dto.title,
          sourceFileName: dto.sourceFileName ?? file?.originalname ?? null,
          sourceFileType: file?.mimetype ?? null,
          sourceFileUrl,
          rawText: extractedRawText,
          status: dto.status ?? (file ? "uploaded" : "draft"),
          kind: ResumeKind.master,
          isMaster: shouldBecomeMaster,
        },
      });

      return createdResume;
    });

    // Fase 2 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md):
    // atrás de CV_STRUCTURED_PROFILE_PIPELINE_ENABLED. Ligada, substitui o
    // caminho legado ABAIXO para este entrypoint (nunca os dois — rodar os
    // dois pagaria a extração de IA em dobro); desligada, comportamento
    // inalterado. O enqueue novo é AWAITED (persiste CvSource/CvSubmission/
    // CvProcessingJob antes da resposta HTTP) — a extração de IA em si só
    // roda depois, no CvProcessingWorker (cron separado), nunca aqui.
    if (
      createdResume.isMaster &&
      isCvStructuredProfilePipelineEnabled() &&
      this.cvProcessingEntrypoint
    ) {
      const text = extractedRawText?.trim();
      if (text) {
        try {
          await this.cvProcessingEntrypoint.enqueueFromUserText({
            userId,
            text,
            masterIntent: dto.isPrimary
              ? "PROMOTE_EXPLICIT"
              : "PROMOTE_IF_FIRST",
            submission: file
              ? {
                  origin: "FILE_UPLOAD",
                  fileName: file.originalname,
                  mimeType: file.mimetype,
                  fileSizeBytes: file.size,
                }
              : { origin: "PASTED_TEXT" },
          });
        } catch (error) {
          console.error(
            "[resumes] failed to enqueue cv processing job (new pipeline)",
            {
              error: error instanceof Error ? error.message : String(error),
              resumeId: createdResume.id,
              userId,
            },
          );
        }
      }
    } else if (
      createdResume.isMaster &&
      this.masterCvCanonicalExtractionService
    ) {
      try {
        await this.masterCvCanonicalExtractionService.enqueueFromMasterResumeUpload(
          {
            userId,
            resumeId: createdResume.id,
            ...(extractedRawText ? { rawText: extractedRawText } : {}),
            file: file
              ? {
                  buffer: file.buffer,
                  originalname: file.originalname,
                  mimetype: file.mimetype,
                  size: file.size,
                }
              : undefined,
          },
        );
      } catch (error) {
        console.error(
          "[resumes] failed to process master CV canonical extraction",
          {
            error: error instanceof Error ? error.message : String(error),
            resumeId: createdResume.id,
            userId,
          },
        );
      }
    }

    return createdResume;
  }

  private parseExtractionCoverage(
    value: unknown,
  ): MasterCvExtractionCoverageDto | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const coverage = value as {
      identifiedFields?: unknown;
      missingFields?: unknown;
      fieldStatus?: unknown;
    };

    const fieldStatusRecord =
      coverage.fieldStatus &&
      typeof coverage.fieldStatus === "object" &&
      !Array.isArray(coverage.fieldStatus)
        ? coverage.fieldStatus
        : {};

    const fieldStatus: MasterCvExtractionCoverageDto["fieldStatus"] = {};
    for (const [field, status] of Object.entries(fieldStatusRecord)) {
      if (status === "filled" || status === "partial" || status === "missing") {
        fieldStatus[field] = status;
      }
    }

    return {
      identifiedFields: this.parseStringArray(coverage.identifiedFields),
      missingFields: this.parseStringArray(coverage.missingFields),
      fieldStatus,
    };
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string");
  }

  async update(userId: string, resumeId: string, dto: UpdateResumeDto) {
    const existingResume = await this.getById(userId, resumeId);

    return this.database.$transaction(async (tx) => {
      const otherResumeCount = await tx.resume.count({
        where: {
          userId,
          NOT: { id: resumeId },
        },
      });
      const shouldRemainMaster =
        dto.isPrimary === undefined
          ? existingResume.isMaster
          : dto.isPrimary ||
            (existingResume.isMaster && otherResumeCount === 0);

      if (shouldRemainMaster) {
        await this.demoteOtherResumes(tx, userId, resumeId);
      }

      const updateResult = await tx.resume.updateMany({
        where: { id: resumeId, userId },
        data: {
          title: dto.title,
          sourceFileName: dto.sourceFileName,
          status: dto.status,
          kind: shouldRemainMaster
            ? ResumeKind.master
            : this.resolveNonMasterKind(existingResume.kind),
          isMaster: shouldRemainMaster,
        },
      });

      if (updateResult.count !== 1) {
        throw new NotFoundException("resume not found");
      }

      const updatedResume = await tx.resume.findFirst({
        where: { id: resumeId, userId },
      });

      if (!updatedResume) {
        throw new NotFoundException("resume not found");
      }

      return updatedResume;
    });
  }

  // Fase 2G (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
  // "Integrar POST /resumes/:id/set-primary"): o flip de Resume.isMaster em
  // si (bloco abaixo) é IDÊNTICO ao comportamento legado, com a flag ligada
  // ou desligada — é sempre síncrono e sempre a fonte de verdade imediata
  // do "Resume.isMaster" que o resto do produto lê hoje. A integração com o
  // pipeline canônico (CvSource/CvStructuredProfile/CvMasterDesignation)
  // roda DEPOIS desse commit, só quando a flag está ligada, e nunca pode
  // fazer esta chamada falhar para o usuário — falha na integração é
  // logada e a resposta ainda reflete o Resume.isMaster já commitado
  // (mesma tolerância a falha fire-and-forget já usada em
  // resumes.service.ts#create/cv-adaptation.service.ts#triggerMasterCvExtraction).
  async setPrimary(userId: string, resumeId: string) {
    const updatedResume = await this.database.$transaction(async (tx) => {
      const resume = await tx.resume.findFirst({
        where: {
          id: resumeId,
          userId,
        },
      });

      if (!resume) {
        throw new NotFoundException("resume not found");
      }

      await this.demoteOtherResumes(tx, userId, resume.id);

      const updateResult = await tx.resume.updateMany({
        where: { id: resume.id, userId },
        data: {
          kind: ResumeKind.master,
          isMaster: true,
        },
      });

      if (updateResult.count !== 1) {
        throw new NotFoundException("resume not found");
      }

      return tx.resume.findFirstOrThrow({
        where: { id: resume.id, userId },
      });
    });

    if (
      !isCvStructuredProfilePipelineEnabled() ||
      !this.cvProcessingEntrypoint ||
      !this.cvMasterPromotion
    ) {
      return updatedResume;
    }

    try {
      const pipeline = await this.ensureCanonicalMasterPromotion(
        userId,
        updatedResume,
      );
      return {
        ...updatedResume,
        cvProcessingJobId: pipeline.cvProcessingJobId,
        cvMasterPromoted: pipeline.promoted,
      };
    } catch (error) {
      console.error(
        "[resumes] failed to integrate set-primary with cv structured profile pipeline",
        {
          error: error instanceof Error ? error.message : String(error),
          resumeId: updatedResume.id,
          userId,
        },
      );
      return updatedResume;
    }
  }

  // Garante, em ordem (plano, itens 1-6 de "Integrar set-primary"):
  //  1. CvSource: se o Resume alvo já está ligado a um (cvSourceId — Fase
  //     2G é quem passa a preencher esse campo, nunca preenchido antes por
  //     nenhum entrypoint), reusa; senão materializa just-in-time via
  //     CvProcessingEntrypointService (mesmo padrão de
  //     cv-adaptation.service.ts#resolveActiveMasterCvProcessingJobId,
  //     Fase 2C.1) a partir de resume.rawText.
  //  2. CvStructuredProfile READY: se já existe uma pronta para aquele
  //     cvSourceId, promove SEM criar CvProcessingJob novo nem reprocessar
  //     IA (teste obrigatório "Resume já processado"). Senão, o
  //     CvProcessingJob recém-enfileirado cuida da extração (reusando
  //     MasterCvCanonicalExtraction legada via tryReuseLegacyExtraction
  //     quando aplicável) de forma assíncrona — o worker
  //     (CvProcessingWorker) promove sozinho ao chegar em READY, porque o
  //     job já carrega masterIntent: PROMOTE_EXPLICIT.
  //  3. Promoção: sempre PROMOTE_EXPLICIT — é uma troca explícita do
  //     usuário (plano, seção 10).
  //  5/6. UserProfile + MonitorProjectionJob: cobertos dentro de
  //     CvMasterPromotionService#promoteAndProject (síncrono, branch 1) OU
  //     dentro do próprio CvProcessingWorker (assíncrono, branch 2) — nunca
  //     um passo isolado aqui.
  private async ensureCanonicalMasterPromotion(
    userId: string,
    resume: { id: string; cvSourceId: string | null; rawText: string | null },
  ): Promise<{ cvProcessingJobId: string | null; promoted: boolean }> {
    // Guardas redundantes com as do chamador (setPrimary): este método
    // nunca é invocado sem as duas dependências resolvidas, mas capturar
    // referências locais não-opcionais aqui evita non-null assertion (!)
    // nas chamadas abaixo, mantendo o typecheck estrito.
    const entrypoint = this.cvProcessingEntrypoint;
    const masterPromotion = this.cvMasterPromotion;
    if (!entrypoint || !masterPromotion) {
      return { cvProcessingJobId: null, promoted: false };
    }

    if (resume.cvSourceId) {
      const readyProfile = await this.database.cvStructuredProfile.findFirst({
        where: { cvSourceId: resume.cvSourceId, status: "READY" },
        orderBy: { finishedAt: "desc" },
      });

      if (readyProfile) {
        const promotion = await masterPromotion.promoteAndProject({
          ownerType: "USER",
          userId,
          cvStructuredProfileId: readyProfile.id,
          resumeId: resume.id,
          masterIntent: "PROMOTE_EXPLICIT",
          promotedReason: "EXPLICIT_FLAG",
          canonicalProfile: readyProfile.canonicalJson as never,
          confidence:
            (readyProfile.confidenceJson as Record<string, number> | null) ??
            {},
          cvSourceId: resume.cvSourceId,
        });
        return { cvProcessingJobId: null, promoted: promotion.changed };
      }
    }

    // Resume legado — nunca passou pelo pipeline novo (cvSourceId nulo) ou
    // ainda não tem nenhuma extração READY para a fonte já ligada. Sem
    // texto extraído não há o que materializar — comportamento legado
    // (Resume.isMaster já commitado acima) prevalece, sem erro.
    const text = resume.rawText?.trim();
    if (!text) {
      return { cvProcessingJobId: null, promoted: false };
    }

    const enqueued = await entrypoint.enqueueFromUserText({
      userId,
      text,
      masterIntent: "PROMOTE_EXPLICIT",
      submission: { origin: "PASTED_TEXT" },
    });

    // Guarantee #1 do plano ("Resume alvo possui CvSource"): liga o Resume
    // à fonte materializada — nenhum entrypoint anterior (Fase 2A incluída)
    // fazia essa ligação, então resume.cvSourceId ficava sempre nulo mesmo
    // depois de processado. cvSubmissionId é @unique em Resume — a
    // CvSubmission recém-criada por este enqueue nunca foi usada por outro
    // Resume, então esta atualização nunca colide.
    await this.database.resume.update({
      where: { id: resume.id },
      data: {
        cvSourceId: enqueued.cvSource.id,
        cvSubmissionId: enqueued.cvSubmission.id,
      },
    });

    return { cvProcessingJobId: enqueued.job.id, promoted: false };
  }

  async download(userId: string, resumeId: string, res: Response) {
    const resume = await this.getById(userId, resumeId);

    if (resume.sourceFileUrl) {
      const key = this.extractKeyFromUrl(resume.sourceFileUrl);
      if (key) {
        const sourceBuffer = await this.storage.getObject(key);
        const filename = resume.sourceFileName ?? "cv";

        res.setHeader(
          "Content-Type",
          resume.sourceFileType ?? "application/octet-stream",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        res.send(sourceBuffer);
        return;
      }
    }

    const text = resume.rawText ?? "";
    const filename = resume.sourceFileName
      ? `${resume.sourceFileName.replace(/\.[^.]+$/, "")}.txt`
      : "cv.txt";

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(text);
  }

  async remove(userId: string, resumeId: string) {
    await this.getById(userId, resumeId);

    await this.database.$transaction(async (tx) => {
      // Deletar um resume não "resgata"/promove outro a master — qualquer
      // resume que dependia dele (basedOnResumeId) perde o contexto de
      // origem e deixa de fazer sentido como dado, então é limpo junto em
      // vez de ficar órfão (o que violaria Resume_adapted_requires_context_check
      // quando o resume órfão não tem templateId/targetJobId/targetJobTitle).
      await tx.resume.deleteMany({
        where: { userId, basedOnResumeId: resumeId },
      });

      const deleteResult = await tx.resume.deleteMany({
        where: { id: resumeId, userId },
      });

      if (deleteResult.count !== 1) {
        throw new NotFoundException("resume not found");
      }
    });

    return { ok: true } as const;
  }

  private demoteOtherResumes(
    tx: Prisma.TransactionClient,
    userId: string,
    resumeIdToKeep?: string,
  ) {
    return tx.resume.updateMany({
      where: {
        userId,
        ...(resumeIdToKeep ? { NOT: { id: resumeIdToKeep } } : {}),
      },
      data: {
        isMaster: false,
      },
    });
  }

  private resolveNonMasterKind(kind: ResumeKind) {
    return kind;
  }

  private extractKeyFromUrl(url: string): string | null {
    const bucket = process.env.S3_BUCKET ?? "earlycv-local";
    const marker = `/${bucket}/`;
    const idx = url.indexOf(marker);
    return idx >= 0 ? url.slice(idx + marker.length) : null;
  }
}
