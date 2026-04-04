import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { CreateResumeTemplateDto } from "./dto/create-resume-template.dto";
import type { UpdateResumeTemplateDto } from "./dto/update-resume-template.dto";

@Injectable()
export class ResumeTemplatesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  list() {
    return this.database.resumeTemplate.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  listActive() {
    return this.database.resumeTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        targetRole: true,
        previewImageUrl: true,
        fileUrl: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async create(dto: CreateResumeTemplateDto) {
    try {
      return await this.database.resumeTemplate.create({
        data: this.toResumeTemplateCreateData(dto),
      });
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async update(templateId: string, dto: UpdateResumeTemplateDto) {
    await this.getById(templateId);

    try {
      return await this.database.resumeTemplate.update({
        where: { id: templateId },
        data: this.toResumeTemplateUpdateData(dto),
      });
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async toggleStatus(templateId: string) {
    const template = await this.getById(templateId);

    return this.database.resumeTemplate.update({
      where: { id: templateId },
      data: {
        isActive: !template.isActive,
      },
    });
  }

  private async getById(templateId: string) {
    const template = await this.database.resumeTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException("resume template not found");
    }

    return template;
  }

  private toResumeTemplateCreateData(
    dto: CreateResumeTemplateDto,
  ): Prisma.ResumeTemplateCreateInput {
    const { structureJson, ...data } = dto;

    return {
      ...data,
      ...(structureJson !== undefined
        ? { structureJson: structureJson as Prisma.InputJsonObject }
        : {}),
    };
  }

  private toResumeTemplateUpdateData(
    dto: UpdateResumeTemplateDto,
  ): Prisma.ResumeTemplateUpdateInput {
    const { structureJson, ...data } = dto;

    return {
      ...data,
      ...(structureJson !== undefined
        ? { structureJson: structureJson as Prisma.InputJsonObject }
        : {}),
    };
  }

  private rethrowKnownError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("resume template already exists");
    }

    throw error;
  }
}
