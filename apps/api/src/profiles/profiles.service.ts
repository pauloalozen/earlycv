import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import type { ProfileFieldMetaEntry } from "./profile-canonical.types";

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getByUserId(userId: string) {
    const profile = await this.database.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException("profile not found");
    }

    return profile;
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const profile = await this.getByUserId(userId);
    const nowIso = new Date().toISOString();
    const touchedFieldPaths = Object.keys(dto).filter(
      (key) => dto[key as keyof UpdateProfileDto] !== undefined,
    );
    const existingMeta = this.parseFieldMeta(profile.profileFieldMetaJson);

    for (const fieldPath of touchedFieldPaths) {
      existingMeta[fieldPath] = {
        ...existingMeta[fieldPath],
        source: "manual_edit",
        manuallyEdited: true,
        lastEditedAt: nowIso,
      };
    }

    return this.database.userProfile.update({
      where: { userId },
      data: {
        ...dto,
        experiencesJson: this.toJsonValue(dto.experiencesJson),
        educationJson: this.toJsonValue(dto.educationJson),
        skillsJson: this.toJsonValue(dto.skillsJson),
        languagesJson: this.toJsonValue(dto.languagesJson),
        certificationsJson: this.toJsonValue(dto.certificationsJson),
        profileFieldMetaJson: existingMeta,
      },
    });
  }

  private parseFieldMeta(
    value: unknown,
  ): Record<string, ProfileFieldMetaEntry> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, ProfileFieldMetaEntry>;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return value as Prisma.InputJsonValue;
  }
}
