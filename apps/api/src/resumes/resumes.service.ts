import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type Prisma, ResumeKind } from "@prisma/client";
import type { Response } from "express";
import { extractTextFromCvFile } from "../common/cv-text-extractor";
import type { FileUpload } from "../cv-adaptation/dto/create-cv-adaptation.dto";
import { DatabaseService } from "../database/database.service";
import type { CanonicalProfileData } from "../profiles/profile-canonical.types";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { StorageService } from "../storage/storage.service";
import type { CreateResumeDto } from "./dto/create-resume.dto";
import type { UpdateResumeDto } from "./dto/update-resume.dto";

@Injectable()
export class ResumesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StorageService)
    private readonly storage: Pick<StorageService, "getObject" | "putObject">,
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
    let sourceFileUrl: string | null = null;

    if (file) {
      try {
        rawText = await extractTextFromCvFile(file);
      } catch (error) {
        throw new BadRequestException(
          `Failed to extract text from file: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }

      const key = `resumes/${userId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      sourceFileUrl = await this.storage.putObject(
        key,
        file.buffer,
        file.mimetype,
      );
    }

    return this.database.$transaction(async (tx) => {
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
          rawText,
          status: dto.status ?? (rawText ? "uploaded" : "draft"),
          kind: ResumeKind.master,
          isMaster: shouldBecomeMaster,
        },
      });

      if (rawText && shouldBecomeMaster) {
        await this.mergeCanonicalProfileFromBaseCv(tx, {
          sourceCvId: createdResume.id,
          text: rawText,
          userId,
        });
      }

      return createdResume;
    });
  }

  private async mergeCanonicalProfileFromBaseCv(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      text: string;
      sourceCvId: string;
    },
  ) {
    const profile = await tx.userProfile.findUnique({
      where: { userId: input.userId },
    });
    if (!profile) {
      return;
    }

    const incoming = this.extractCanonicalProfileFromText(input.text);
    if (!incoming.fullName && !incoming.phone && !incoming.linkedinUrl) {
      return;
    }

    const existing = this.mapProfileRecordToCanonicalData(profile);
    const merged = this.profileMergeService.merge({
      existing,
      incoming,
      source: "base_cv_upload",
      sourceCvId: input.sourceCvId,
      fieldMeta: this.parseFieldMeta(profile.profileFieldMetaJson),
      suggestions: this.parseSuggestions(profile.profileSuggestionsJson),
    });

    const readiness = this.profileReadinessService.compute({
      ...merged.next,
      experiences: merged.next.experiences ?? [],
      education: merged.next.education ?? [],
      skills: merged.next.skills ?? { technical: [], business: [], soft: [] },
    });

    await tx.userProfile.update({
      where: { userId: input.userId },
      data: {
        fullName: merged.next.fullName ?? profile.fullName,
        headline: merged.next.headline ?? profile.headline,
        linkedinUrl: merged.next.linkedinUrl ?? profile.linkedinUrl,
        phone: merged.next.phone ?? profile.phone,
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
      },
    });
  }

  private extractCanonicalProfileFromText(
    text: string,
  ): Partial<CanonicalProfileData> {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const firstLine = lines[0];
    const phoneMatch = text.match(
      /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/,
    );
    const linkedinMatch = text.match(
      /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_.%]+\/?/i,
    );

    return {
      fullName:
        firstLine && /^[A-Za-zÀ-ÖØ-öø-ÿ'\-\s]{3,80}$/.test(firstLine)
          ? firstLine
          : undefined,
      headline: lines[1],
      linkedinUrl: linkedinMatch?.[0],
      phone: phoneMatch?.[0],
      professionalSummary: lines.slice(2, 6).join(" ").slice(0, 400),
      skills: {
        technical: [],
        business: [],
        soft: [],
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
    const parsedSkills = this.parseRecord(profile.skillsJson) as {
      technical?: unknown;
      business?: unknown;
      soft?: unknown;
    };

    return {
      city: profile.city ?? undefined,
      country: profile.country ?? undefined,
      education: this.parseEducationArray(profile.educationJson),
      experiences: this.parseExperienceArray(profile.experiencesJson),
      fullName: profile.fullName ?? undefined,
      headline: profile.headline ?? undefined,
      linkedinUrl: profile.linkedinUrl ?? undefined,
      phone: profile.phone ?? undefined,
      professionalSummary: profile.professionalSummary ?? undefined,
      skills: {
        business: this.parseStringArray(parsedSkills.business),
        soft: this.parseStringArray(parsedSkills.soft),
        technical: this.parseStringArray(parsedSkills.technical),
      },
      state: profile.state ?? undefined,
    };
  }

  private parseExperienceArray(
    value: unknown,
  ): CanonicalProfileData["experiences"] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is CanonicalProfileData["experiences"][number] =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string",
    );
  }

  private parseEducationArray(
    value: unknown,
  ): CanonicalProfileData["education"] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is CanonicalProfileData["education"][number] =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string",
    );
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string");
  }

  private parseRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private parseFieldMeta(value: unknown): Record<
    string,
    {
      source: "analysis_upload" | "base_cv_upload" | "manual_edit";
      manuallyEdited?: boolean;
      lastEditedAt?: string;
      sourceCvId?: string | null;
    }
  > {
    const record = this.parseRecord(value);
    const parsed: Record<
      string,
      {
        source: "analysis_upload" | "base_cv_upload" | "manual_edit";
        manuallyEdited?: boolean;
        lastEditedAt?: string;
        sourceCvId?: string | null;
      }
    > = {};

    for (const [key, entry] of Object.entries(record)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const source = (entry as { source?: unknown }).source;
      if (
        source !== "analysis_upload" &&
        source !== "base_cv_upload" &&
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
      };
    }

    return parsed;
  }

  private parseSuggestions(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (
        item,
      ): item is {
        fieldPath: string;
        currentValue: unknown;
        suggestedValue: unknown;
        status: "pending" | "accepted" | "rejected";
        source: "analysis_upload" | "base_cv_upload" | "manual_edit";
        sourceCvId?: string | null;
        createdAt: string;
      } => typeof item === "object" && item !== null,
    );
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
