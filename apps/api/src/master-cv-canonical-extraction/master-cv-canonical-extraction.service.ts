import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

import { DatabaseService } from "../database/database.service";
import type {
  CanonicalProfileData,
  ProfileFieldMetaEntry,
  ProfileSuggestion,
} from "../profiles/profile-canonical.types";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { parseMasterCvCanonicalExtractionPayload } from "./master-cv-canonical-extraction.schema";
import type {
  EnqueueMasterCvCanonicalExtractionInput,
  MasterCvCanonicalExtractionOutput,
  ProcessMasterCvCanonicalExtractionJobInput,
} from "./master-cv-canonical-extraction.types";

type ExtractionClient = {
  extract(input: {
    masterCvText: string;
  }): Promise<MasterCvCanonicalExtractionOutput>;
};

@Injectable()
export class MasterCvCanonicalExtractionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProfileCanonicalMergeService)
    private readonly profileMergeService: Pick<
      ProfileCanonicalMergeService,
      "merge"
    >,
    @Inject(ProfileReadinessService)
    private readonly profileReadinessService: Pick<
      ProfileReadinessService,
      "compute"
    >,
    @Inject("OPENAI_CLIENT") private readonly aiClient: OpenAI,
    private readonly extractionClient?: ExtractionClient,
  ) {}

  async enqueueFromMasterResumeUpload(
    input: EnqueueMasterCvCanonicalExtractionInput,
  ) {
    const inputHash = createHash("sha256").update(input.rawText).digest("hex");
    const table = this.database.masterCvCanonicalExtraction;

    const existing = await table.findFirst({
      where: {
        resumeId: input.resumeId,
        inputHash,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    if (existing) {
      return existing;
    }

    try {
      return await table.create({
        data: {
          userId: input.userId,
          resumeId: input.resumeId,
          inputHash,
          status: "pending",
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      const reused = await table.findFirst({
        where: {
          resumeId: input.resumeId,
          inputHash,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      if (reused) {
        return reused;
      }
      throw error;
    }
  }

  async processJob(input: ProcessMasterCvCanonicalExtractionJobInput) {
    const table = this.database.masterCvCanonicalExtraction;
    const extraction = await table.findUnique({
      where: { id: input.extractionId },
      include: {
        resume: {
          select: { rawText: true },
        },
      },
    });

    if (!extraction) {
      return null;
    }

    await table.update({
      where: { id: extraction.id },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });

    try {
      const rawText = extraction.resume?.rawText ?? "";
      const output = await this.extractCanonical({ masterCvText: rawText });
      const payload = parseMasterCvCanonicalExtractionPayload(output);

      await this.mergeIntoUserProfile({
        userId: extraction.userId,
        resumeId: extraction.resumeId,
        payload,
        extractedAt: new Date().toISOString(),
      });

      return table.update({
        where: { id: extraction.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          lastError: null,
          canonicalJson: payload.canonicalProfile as Prisma.InputJsonValue,
          coverageJson: payload.extractionCoverage as Prisma.InputJsonValue,
          confidenceJson: payload.confidence as Prisma.InputJsonValue,
          evidenceJson: payload.evidence as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await table.update({
        where: { id: extraction.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          lastError: message,
        },
      });
      throw error;
    }
  }

  async getLatestByUserId(userId: string) {
    return this.database.masterCvCanonicalExtraction.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(extractionId: string) {
    return this.database.masterCvCanonicalExtraction.findUnique({
      where: { id: extractionId },
    });
  }

  private async extractCanonical(input: { masterCvText: string }) {
    if (this.extractionClient) {
      return this.extractionClient.extract(input);
    }

    const { extractMasterCvCanonicalProfile } = await import("@earlycv/ai");
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const { output } = await extractMasterCvCanonicalProfile(
      this.aiClient as never,
      model,
      input,
    );
    return output;
  }

  private async mergeIntoUserProfile(input: {
    userId: string;
    resumeId: string;
    payload: MasterCvCanonicalExtractionOutput;
    extractedAt: string;
  }) {
    const profile = await this.database.userProfile.findUnique({
      where: { userId: input.userId },
    });
    if (!profile) {
      return;
    }

    const merged = this.profileMergeService.merge({
      existing: this.mapProfileRecordToCanonicalData(profile),
      incoming: this.mapExtractionToCanonicalData(input.payload),
      source: "base_cv_ai_extraction",
      sourceCvId: input.resumeId,
      fieldMeta: this.asFieldMetaRecord(profile.profileFieldMetaJson),
      suggestions: this.asSuggestions(profile.profileSuggestionsJson),
      extractionContext: {
        confidence: input.payload.confidence,
        extractedAt: input.extractedAt,
      },
    });

    const readiness = this.profileReadinessService.compute({
      ...merged.next,
      experiences: merged.next.experiences ?? [],
      education: merged.next.education ?? [],
      skills: merged.next.skills ?? { technical: [], business: [], soft: [] },
    });

    await this.database.userProfile.update({
      where: { userId: input.userId },
      data: {
        fullName: merged.next.fullName ?? profile.fullName,
        headline: merged.next.headline ?? profile.headline,
        linkedinUrl: merged.next.linkedinUrl ?? profile.linkedinUrl,
        phone: merged.next.phone ?? profile.phone,
        city: merged.next.city ?? profile.city,
        state: merged.next.state ?? profile.state,
        country: merged.next.country ?? profile.country,
        professionalSummary:
          merged.next.professionalSummary ?? profile.professionalSummary,
        profileFieldMetaJson: merged.fieldMeta as Prisma.InputJsonValue,
        profileSuggestionsJson: merged.suggestions as Prisma.InputJsonValue,
        profileReadinessStatus: readiness,
        skillsJson: (merged.next.skills ?? {
          technical: [],
          business: [],
          soft: [],
        }) as Prisma.InputJsonValue,
        experiencesJson: (merged.next.experiences ??
          []) as Prisma.InputJsonValue,
        educationJson: (merged.next.education ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  private mapExtractionToCanonicalData(
    payload: MasterCvCanonicalExtractionOutput,
  ): Partial<CanonicalProfileData> {
    return {
      fullName: payload.canonicalProfile.fullName ?? undefined,
      headline: payload.canonicalProfile.headline ?? undefined,
      phone: payload.canonicalProfile.phone ?? undefined,
      linkedinUrl: payload.canonicalProfile.linkedinUrl ?? undefined,
      city: payload.canonicalProfile.location.city ?? undefined,
      state: payload.canonicalProfile.location.state ?? undefined,
      country: payload.canonicalProfile.location.country ?? undefined,
      professionalSummary:
        payload.canonicalProfile.professionalSummary ?? undefined,
      experiences: payload.canonicalProfile.experiences.map((experience) => {
        const id = this.buildDeterministicId("exp", [
          experience.company,
          experience.role,
          experience.startDate,
          experience.endDate,
          ...(experience.bullets ?? []),
          ...(experience.technologies ?? []),
        ]);
        return {
          id,
          company: experience.company ?? undefined,
          role: experience.role ?? undefined,
          startDate: experience.startDate ?? undefined,
          endDate: experience.endDate ?? undefined,
          description: experience.bullets.join("\n").trim() || undefined,
          relatedSkills: experience.technologies,
        };
      }),
      education: payload.canonicalProfile.education.map((entry) => {
        const id = this.buildDeterministicId("edu", [
          entry.institution,
          entry.degree,
          entry.fieldOfStudy,
          entry.startDate,
          entry.endDate,
        ]);
        return {
          id,
          institution: entry.institution ?? undefined,
          degree: entry.degree ?? undefined,
          fieldOfStudy: entry.fieldOfStudy ?? undefined,
          startDate: entry.startDate ?? undefined,
          endDate: entry.endDate ?? undefined,
        };
      }),
      skills: {
        technical: payload.canonicalProfile.skills.technical,
        business: payload.canonicalProfile.skills.business,
        soft: payload.canonicalProfile.skills.soft,
      },
    };
  }

  private mapProfileRecordToCanonicalData(profile: {
    fullName: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    headline: string | null;
    professionalSummary: string | null;
    experiencesJson: unknown;
    educationJson: unknown;
    skillsJson: unknown;
  }): CanonicalProfileData {
    const skills = this.asRecord(profile.skillsJson);
    return {
      fullName: profile.fullName ?? undefined,
      phone: profile.phone ?? undefined,
      linkedinUrl: profile.linkedinUrl ?? undefined,
      city: profile.city ?? undefined,
      state: profile.state ?? undefined,
      country: profile.country ?? undefined,
      headline: profile.headline ?? undefined,
      professionalSummary: profile.professionalSummary ?? undefined,
      experiences: this.asArray(
        profile.experiencesJson,
      ) as CanonicalProfileData["experiences"],
      education: this.asArray(
        profile.educationJson,
      ) as CanonicalProfileData["education"],
      skills: {
        technical: this.asStringArray(skills.technical),
        business: this.asStringArray(skills.business),
        soft: this.asStringArray(skills.soft),
      },
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asFieldMetaRecord(
    value: unknown,
  ): Record<string, ProfileFieldMetaEntry> {
    const record = this.asRecord(value);
    const parsed: Record<string, ProfileFieldMetaEntry> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const source = (entry as { source?: unknown }).source;
      if (
        source !== "analysis_upload" &&
        source !== "base_cv_upload" &&
        source !== "base_cv_ai_extraction" &&
        source !== "manual_edit"
      ) {
        continue;
      }

      parsed[key] = {
        source,
        manuallyEdited:
          typeof (entry as { manuallyEdited?: unknown }).manuallyEdited ===
          "boolean"
            ? (entry as { manuallyEdited: boolean }).manuallyEdited
            : undefined,
        lastEditedAt:
          typeof (entry as { lastEditedAt?: unknown }).lastEditedAt === "string"
            ? (entry as { lastEditedAt: string }).lastEditedAt
            : undefined,
        sourceCvId:
          typeof (entry as { sourceCvId?: unknown }).sourceCvId === "string" ||
          (entry as { sourceCvId?: unknown }).sourceCvId === null
            ? ((entry as { sourceCvId?: string | null }).sourceCvId ?? null)
            : undefined,
        sourceConfidence:
          typeof (entry as { sourceConfidence?: unknown }).sourceConfidence ===
          "number"
            ? (entry as { sourceConfidence: number }).sourceConfidence
            : undefined,
        sourceExtractedAt:
          typeof (entry as { sourceExtractedAt?: unknown })
            .sourceExtractedAt === "string"
            ? (entry as { sourceExtractedAt: string }).sourceExtractedAt
            : undefined,
      };
    }
    return parsed;
  }

  private asSuggestions(value: unknown): ProfileSuggestion[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is ProfileSuggestion => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const candidate = entry as {
        createdAt?: unknown;
        currentValue?: unknown;
        fieldPath?: unknown;
        source?: unknown;
        status?: unknown;
        suggestedValue?: unknown;
        sourceCvId?: unknown;
      };

      const validSource =
        candidate.source === "analysis_upload" ||
        candidate.source === "base_cv_upload" ||
        candidate.source === "base_cv_ai_extraction" ||
        candidate.source === "manual_edit";
      const validStatus =
        candidate.status === "pending" ||
        candidate.status === "accepted" ||
        candidate.status === "rejected";

      return (
        typeof candidate.fieldPath === "string" &&
        typeof candidate.createdAt === "string" &&
        validSource &&
        validStatus
      );
    });
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string");
  }

  private buildDeterministicId(prefix: string, values: Array<string | null>) {
    const fingerprint = values
      .map((value) => this.normalizeFingerprintPart(value))
      .filter((value) => value.length > 0)
      .join("|");
    const hash = createHash("sha256")
      .update(fingerprint)
      .digest("hex")
      .slice(0, 12);
    return `${prefix}_${hash}`;
  }

  private normalizeFingerprintPart(value: string | null): string {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false;
    }
    const maybeCode = (error as { code?: unknown }).code;
    return maybeCode === "P2002";
  }
}
