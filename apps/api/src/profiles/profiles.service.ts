import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import type {
  CanonicalProfileData,
  ProfileFieldMetaEntry,
} from "./profile-canonical.types";
import { ProfileReadinessService } from "./profile-readiness.service";

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProfileReadinessService)
    private readonly profileReadinessService: Pick<
      ProfileReadinessService,
      "compute"
    >,
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

    const readiness = this.profileReadinessService.compute({
      fullName: dto.fullName !== undefined ? dto.fullName : profile.fullName ?? undefined,
      headline: dto.headline !== undefined ? dto.headline : profile.headline ?? undefined,
      professionalSummary:
        dto.professionalSummary !== undefined
          ? dto.professionalSummary
          : profile.professionalSummary ?? undefined,
      experiences: this.asArray(
        dto.experiencesJson !== undefined
          ? dto.experiencesJson
          : profile.experiencesJson,
      ) as CanonicalProfileData["experiences"],
      education: this.asArray(
        dto.educationJson !== undefined ? dto.educationJson : profile.educationJson,
      ) as CanonicalProfileData["education"],
      skills: this.asSkills(
        dto.skillsJson !== undefined ? dto.skillsJson : profile.skillsJson,
      ),
      languages: this.asArray(
        dto.languagesJson !== undefined
          ? dto.languagesJson
          : profile.languagesJson,
      ) as CanonicalProfileData["languages"],
      certifications: this.asArray(
        dto.certificationsJson !== undefined
          ? dto.certificationsJson
          : profile.certificationsJson,
      ) as CanonicalProfileData["certifications"],
    });

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
        profileReadinessStatus: readiness,
      },
    });
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asSkills(value: unknown): CanonicalProfileData["skills"] {
    const record =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return {
      technical: this.asStringArray(record.technical),
      business: this.asStringArray(record.business),
      soft: this.asStringArray(record.soft),
    };
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
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
