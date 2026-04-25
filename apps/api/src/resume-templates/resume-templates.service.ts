import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";
import type { CreateResumeTemplateDto } from "./dto/create-resume-template.dto";
import type { UpdateResumeTemplateDto } from "./dto/update-resume-template.dto";
import { ResumeTemplateDocxService } from "./resume-template-docx.service";
import { ResumeTemplateGeneratorService } from "./resume-template-generator.service";

@Injectable()
export class ResumeTemplatesService {
  private readonly logger = new Logger(ResumeTemplatesService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ResumeTemplateGeneratorService)
    private readonly generator: ResumeTemplateGeneratorService,
    @Inject(ResumeTemplateDocxService)
    private readonly docx: ResumeTemplateDocxService,
  ) {}

  async getSignedUrls(id: string) {
    const template = await this.database.resumeTemplate.findUnique({
      where: { id },
      select: { fileUrl: true, previewImageUrl: true },
    });

    if (!template) throw new NotFoundException("Template not found");

    const sign = async (url: string | null) => {
      if (!url) return null;
      const key = this.storage.extractKeyFromUrl(url);
      if (!key) return null;
      return this.storage.getPresignedUrl(key, 900);
    };

    return {
      fileUrl: await sign(template.fileUrl),
      previewImageUrl: await sign(template.previewImageUrl),
    };
  }

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

  async uploadPreview(
    templateId: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      size: number;
      originalname: string;
    },
  ) {
    const template = await this.getById(templateId);

    if (template.previewImageUrl) {
      const oldKey = this.extractKeyFromUrl(template.previewImageUrl);
      if (oldKey) {
        await this.storage.deleteObject(oldKey).catch(() => {});
      }
    }

    const ext = file.mimetype === "image/png" ? "png" : "jpg";
    const key = `templates/${templateId}/preview.${ext}`;
    const url = await this.storage.putObject(key, file.buffer, file.mimetype);

    return this.database.resumeTemplate.update({
      where: { id: templateId },
      data: { previewImageUrl: url },
    });
  }

  async uploadFile(
    templateId: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      size: number;
      originalname: string;
    },
  ) {
    const template = await this.getById(templateId);

    // Remove arquivo anterior se existir
    if (template.fileUrl) {
      const oldKey = this.extractKeyFromUrl(template.fileUrl);
      if (oldKey) {
        await this.storage.deleteObject(oldKey).catch(() => {});
      }
    }

    const isDocx =
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.originalname.endsWith(".docx");
    const isPdf = file.mimetype === "application/pdf";
    const ext = isDocx ? "docx" : isPdf ? "pdf" : "bin";

    // Salva arquivo original no MinIO
    const key = `templates/${templateId}/template.${ext}`;
    const url = await this.storage.putObject(key, file.buffer, file.mimetype);

    const updateData: Prisma.ResumeTemplateUpdateInput = {
      fileUrl: url,
      // Clear previous structureJson when a new file is uploaded
      structureJson: Prisma.JsonNull,
    };

    if (isDocx) {
      // DOCX: gera preview preenchendo com dados mockados → LibreOffice → pdftoppm
      try {
        const previewImageUrl = await this.docx.generatePreview(
          file.buffer,
          templateId,
        );
        updateData.previewImageUrl = previewImageUrl;
      } catch (err) {
        this.logger.error(
          `DOCX preview generation failed for ${templateId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (isPdf) {
      // PDF legacy: pdftoppm screenshot direto
      try {
        const { previewImageUrl, ...structure } =
          await this.generator.generateFromPdf(file.buffer, templateId);
        updateData.previewImageUrl = previewImageUrl;
        updateData.structureJson =
          structure as unknown as Prisma.InputJsonObject;
      } catch (err) {
        this.logger.error(
          `PDF template generation failed for ${templateId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return this.database.resumeTemplate.update({
      where: { id: templateId },
      data: updateData,
    });
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

  private extractKeyFromUrl(url: string): string | null {
    const bucket = process.env.S3_BUCKET ?? "earlycv-local";
    const marker = `/${bucket}/`;
    const idx = url.indexOf(marker);
    return idx >= 0 ? url.slice(idx + marker.length) : null;
  }
}
