import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import type { CreateResumeDto } from "./dto/create-resume.dto";
import type { UpdateResumeDto } from "./dto/update-resume.dto";

const PRIMARY_RESUME_SLOT = 1;

@Injectable()
export class ResumesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  list(userId: string) {
    return this.database.resume.findMany({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
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

  async create(userId: string, dto: CreateResumeDto) {
    return this.database.$transaction(async (tx) => {
      const existingResumeCount = await tx.resume.count({ where: { userId } });
      const shouldBecomePrimary = dto.isPrimary ?? existingResumeCount === 0;

      if (shouldBecomePrimary) {
        await tx.resume.updateMany({
          where: { userId },
          data: {
            isPrimary: false,
            primaryResumeSlot: null,
          },
        });
      }

      return tx.resume.create({
        data: {
          userId,
          title: dto.title,
          sourceFileName: dto.sourceFileName,
          sourceFileType: null,
          status: dto.status,
          isPrimary: shouldBecomePrimary,
          primaryResumeSlot: shouldBecomePrimary ? PRIMARY_RESUME_SLOT : null,
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
      const shouldRemainPrimary =
        dto.isPrimary === undefined
          ? existingResume.isPrimary
          : dto.isPrimary ||
            (existingResume.isPrimary && otherResumeCount === 0);

      if (shouldRemainPrimary) {
        await tx.resume.updateMany({
          where: { userId },
          data: {
            isPrimary: false,
            primaryResumeSlot: null,
          },
        });
      }

      return tx.resume.update({
        where: { id: resumeId },
        data: {
          title: dto.title,
          sourceFileName: dto.sourceFileName,
          status: dto.status,
          isPrimary: shouldRemainPrimary,
          primaryResumeSlot: shouldRemainPrimary ? PRIMARY_RESUME_SLOT : null,
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

      await tx.resume.updateMany({
        where: { userId },
        data: {
          isPrimary: false,
          primaryResumeSlot: null,
        },
      });

      return tx.resume.update({
        where: { id: resume.id },
        data: {
          isPrimary: true,
          primaryResumeSlot: PRIMARY_RESUME_SLOT,
        },
      });
    });
  }

  async remove(userId: string, resumeId: string) {
    const resume = await this.getById(userId, resumeId);

    await this.database.$transaction(async (tx) => {
      await tx.resume.delete({
        where: { id: resumeId },
      });

      if (!resume.isPrimary) {
        return;
      }

      const nextResume = await tx.resume.findFirst({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      });

      if (!nextResume) {
        return;
      }

      await tx.resume.update({
        where: { id: nextResume.id },
        data: {
          isPrimary: true,
          primaryResumeSlot: PRIMARY_RESUME_SLOT,
        },
      });
    });

    return { ok: true } as const;
  }
}
