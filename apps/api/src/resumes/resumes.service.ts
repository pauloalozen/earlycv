import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type Prisma, ResumeKind } from "@prisma/client";
import type { Response } from "express";
import type { FileUpload } from "../cv-adaptation/dto/create-cv-adaptation.dto";
import { DatabaseService } from "../database/database.service";
import type { CreateResumeDto } from "./dto/create-resume.dto";
import type { UpdateResumeDto } from "./dto/update-resume.dto";

@Injectable()
export class ResumesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
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

  async create(userId: string, dto: CreateResumeDto, file?: FileUpload) {
    let rawText: string | null = null;

    if (file) {
      try {
        const { extractTextFromPdf } = await import("@earlycv/ai");
        rawText = await extractTextFromPdf(file.buffer);
      } catch (error) {
        throw new BadRequestException(
          `Failed to extract text from PDF: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    return this.database.$transaction(async (tx) => {
      const existingResumeCount = await tx.resume.count({ where: { userId } });
      const shouldBecomeMaster = dto.isPrimary ?? existingResumeCount === 0;

      if (shouldBecomeMaster) {
        await this.demoteOtherResumes(tx, userId);
      }

      return tx.resume.create({
        data: {
          userId,
          title: dto.title,
          sourceFileName: dto.sourceFileName ?? file?.originalname ?? null,
          sourceFileType: file?.mimetype ?? null,
          rawText,
          status: dto.status ?? (rawText ? "uploaded" : "draft"),
          kind: ResumeKind.master,
          isMaster: shouldBecomeMaster,
        },
      });
    });
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

      return tx.resume.update({
        where: { id: resumeId },
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

      return tx.resume.update({
        where: { id: resume.id },
        data: {
          kind: ResumeKind.master,
          isMaster: true,
        },
      });
    });
  }

  async download(userId: string, resumeId: string, res: Response) {
    const resume = await this.getById(userId, resumeId);

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
            basedOnResumeId: resumeId,
            NOT: { id: nextResume.id },
          },
          data: {
            basedOnResumeId: nextResume.id,
          },
        });

        await tx.resume.update({
          where: { id: nextResume.id },
          data: {
            basedOnResumeId: null,
            kind: ResumeKind.master,
            isMaster: true,
          },
        });
      }

      await tx.resume.delete({
        where: { id: resumeId },
      });

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
}
