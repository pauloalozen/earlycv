import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import type { UpdateAdminResumeDto } from "./dto/update-admin-resume.dto";

@Injectable()
export class AdminResumesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  list() {
    return this.database.resume.findMany({
      where: {
        user: {
          isStaff: false,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async getById(resumeId: string) {
    return this.loadProductResumeById(resumeId);
  }

  async update(resumeId: string, dto: UpdateAdminResumeDto) {
    const existingResume = await this.loadProductResumeById(resumeId);

    if (dto.isMaster === true) {
      return this.promoteResumeToMaster(resumeId, {
        ...dto,
        isMaster: true,
        kind: "master",
      });
    }

    const nextIsMaster =
      dto.isMaster === false && existingResume.isMaster
        ? true
        : existingResume.isMaster;
    const nextKind = nextIsMaster
      ? "master"
      : (dto.kind ?? existingResume.kind);

    this.assertAdaptationContext({
      kind: nextKind,
      basedOnResumeId: this.resolveNextValue(
        dto,
        "basedOnResumeId",
        existingResume.basedOnResumeId,
      ),
      templateId: this.resolveNextValue(
        dto,
        "templateId",
        existingResume.templateId,
      ),
      targetJobId: this.resolveNextValue(
        dto,
        "targetJobId",
        existingResume.targetJobId,
      ),
      targetJobTitle: this.resolveNextValue(
        dto,
        "targetJobTitle",
        existingResume.targetJobTitle,
      ),
    });

    return this.database.resume.update({
      where: { id: resumeId },
      data: {
        ...dto,
        isMaster: nextIsMaster,
        kind: nextKind,
      },
    });
  }

  async setMaster(resumeId: string) {
    return this.promoteResumeToMaster(resumeId, {
      isMaster: true,
      kind: "master",
    });
  }

  private async loadProductResumeById(resumeId: string) {
    const resume = await this.database.resume.findFirst({
      where: {
        id: resumeId,
        user: {
          isStaff: false,
        },
      },
    });

    if (!resume) {
      throw new NotFoundException("resume not found");
    }

    return resume;
  }

  private async promoteResumeToMaster(
    resumeId: string,
    data: Partial<UpdateAdminResumeDto> & { isMaster: true; kind: "master" },
  ) {
    return this.database.$transaction(async (tx) => {
      const resume = await tx.resume.findFirst({
        where: {
          id: resumeId,
          user: {
            isStaff: false,
          },
        },
      });

      if (!resume) {
        throw new NotFoundException("resume not found");
      }

      await tx.resume.updateMany({
        where: {
          userId: resume.userId,
          NOT: { id: resume.id },
        },
        data: {
          isMaster: false,
        },
      });

      return tx.resume.update({
        where: { id: resume.id },
        data,
      });
    });
  }

  private assertAdaptationContext(resume: {
    kind: "master" | "adapted";
    basedOnResumeId: string | null | undefined;
    templateId: string | null | undefined;
    targetJobId: string | null | undefined;
    targetJobTitle: string | null | undefined;
  }) {
    if (resume.kind !== "adapted") {
      return;
    }

    const hasContext = [
      resume.basedOnResumeId,
      resume.templateId,
      resume.targetJobId,
      resume.targetJobTitle,
    ].some((value) =>
      typeof value === "string" ? value.trim().length > 0 : value != null,
    );

    if (!hasContext) {
      throw new BadRequestException(
        "adapted resume requires adaptation context",
      );
    }
  }

  private resolveNextValue<K extends keyof UpdateAdminResumeDto>(
    dto: UpdateAdminResumeDto,
    key: K,
    fallback: UpdateAdminResumeDto[K],
  ) {
    return dto[key] !== undefined ? dto[key] : fallback;
  }
}
