import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import type { CreateCvAdaptationDto } from "./dto/create-cv-adaptation.dto";
import { CvAdaptationResponseDto } from "./dto/cv-adaptation-response.dto";

@Injectable()
export class CvAdaptationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CvAdaptationAiService)
    private readonly aiService: CvAdaptationAiService,
  ) {}

  async create(userId: string, dto: CreateCvAdaptationDto) {
    // Require masterResumeId
    if (!dto.masterResumeId) {
      throw new BadRequestException(
        "masterResumeId is required. PDF upload support coming soon.",
      );
    }

    // Verify masterResumeId ownership
    const resume = await this.database.resume.findFirst({
      where: {
        id: dto.masterResumeId,
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
        masterResumeId: dto.masterResumeId,
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

    // Call AI asynchronously (fire and forget for MVP)
    this.aiService.analyzeAndAdapt(adaptation, resume.rawText).catch((err) => {
      console.error(
        `AI adaptation failed for ${adaptation.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    });

    return CvAdaptationResponseDto.fromEntity(adaptation);
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
      items: items.map((a) => CvAdaptationResponseDto.fromEntity(a)),
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

    return CvAdaptationResponseDto.fromEntity(adaptation);
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
}
