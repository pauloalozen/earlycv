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
    const completedExtraction =
      await this.database.masterCvCanonicalExtraction.findFirst({
        where: {
          userId,
          finishedAt: { not: null },
          status: { not: "pending" },
        },
        orderBy: [
          { finishedAt: "desc" },
          { updatedAt: "desc" },
          { createdAt: "desc" },
        ],
        select: {
          status: true,
          coverageJson: true,
          updatedAt: true,
        },
      });

    if (completedExtraction) {
      return {
        status: completedExtraction.status,
        extractionCoverage: this.parseExtractionCoverage(
          completedExtraction.coverageJson,
        ),
        updatedAt: completedExtraction.updatedAt.toISOString(),
      };
    }

    const extraction =
      await this.database.masterCvCanonicalExtraction.findFirst({
        where: { userId },
        orderBy: [
          { finishedAt: "desc" },
          { updatedAt: "desc" },
          { createdAt: "desc" },
        ],
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

    if (createdResume.isMaster && this.masterCvCanonicalExtractionService) {
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

  async setPrimary(userId: string, resumeId: string) {
    return this.database.$transaction(async (tx) => {
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
    const resume = await this.getById(userId, resumeId);

    await this.database.$transaction(async (tx) => {
      const nextResume = resume.isMaster
        ? await tx.resume.findFirst({
            where: {
              userId,
              NOT: { id: resumeId },
            },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          })
        : null;

      if (nextResume) {
        await tx.resume.updateMany({
          where: {
            userId,
            basedOnResumeId: resumeId,
            NOT: { id: nextResume.id },
          },
          data: {
            basedOnResumeId: nextResume.id,
          },
        });

        const promoteResult = await tx.resume.updateMany({
          where: { id: nextResume.id, userId },
          data: {
            basedOnResumeId: null,
            kind: ResumeKind.master,
            isMaster: true,
          },
        });

        if (promoteResult.count !== 1) {
          throw new NotFoundException("resume not found");
        }
      }

      const deleteResult = await tx.resume.deleteMany({
        where: { id: resumeId, userId },
      });

      if (deleteResult.count !== 1) {
        throw new NotFoundException("resume not found");
      }

      if (!nextResume) {
        return;
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
