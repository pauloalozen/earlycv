import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { StructuredJobRequirement } from "./dto/job-requirement.types";

type JobRequirementSetRecord = {
  id: string;
  requirementSourceHash: string;
  canonicalJobId: string;
  requirementsJson: unknown;
  analysisModel: string;
  analysisPromptVersion: string;
};

export type PersistedJobRequirementSet = {
  id: string;
  requirementSourceHash: string;
  canonicalJobId: string;
  requirements: StructuredJobRequirement[];
  analysisModel: string;
  analysisPromptVersion: string;
};

@Injectable()
export class JobRequirementSetsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async findByRequirementSourceHash(
    requirementSourceHash: string,
  ): Promise<PersistedJobRequirementSet | null> {
    const record = await this.database.jobRequirementSet.findUnique({
      where: { requirementSourceHash },
      select: {
        id: true,
        requirementSourceHash: true,
        canonicalJobId: true,
        requirementsJson: true,
        analysisModel: true,
        analysisPromptVersion: true,
      },
    });

    return record ? this.mapRecord(record) : null;
  }

  async getOrCreateFromAnalysis(input: {
    requirementSourceHash: string;
    canonicalJobId: string;
    requirements: StructuredJobRequirement[];
    analysisModel: string;
    analysisPromptVersion: string;
  }): Promise<PersistedJobRequirementSet> {
    const requirements = this.normalizeRequirements(input.requirements);
    const existing = await this.findByRequirementSourceHash(
      input.requirementSourceHash,
    );
    if (existing) {
      return existing;
    }

    try {
      const created = await this.database.jobRequirementSet.create({
        data: {
          requirementSourceHash: input.requirementSourceHash,
          canonicalJobId: input.canonicalJobId,
          requirementsJson: requirements as unknown as Prisma.InputJsonValue,
          analysisModel: input.analysisModel,
          analysisPromptVersion: input.analysisPromptVersion,
        },
        select: {
          id: true,
          requirementSourceHash: true,
          canonicalJobId: true,
          requirementsJson: true,
          analysisModel: true,
          analysisPromptVersion: true,
        },
      });

      return this.mapRecord(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const record = await this.findByRequirementSourceHash(
          input.requirementSourceHash,
        );
        if (record) {
          return record;
        }
      }

      throw error;
    }
  }

  private mapRecord(
    record: JobRequirementSetRecord,
  ): PersistedJobRequirementSet {
    return {
      id: record.id,
      requirementSourceHash: record.requirementSourceHash,
      canonicalJobId: record.canonicalJobId,
      requirements: this.normalizeRequirements(record.requirementsJson),
      analysisModel: record.analysisModel,
      analysisPromptVersion: record.analysisPromptVersion,
    };
  }

  private normalizeRequirements(
    requirements: unknown,
  ): StructuredJobRequirement[] {
    if (!Array.isArray(requirements) || requirements.length === 0) {
      throw new Error("Job requirement set is empty or invalid");
    }

    return requirements.map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(`Job requirement ${index} is invalid`);
      }

      const record = item as Record<string, unknown>;
      const requirementKey = String(record.requirementKey ?? "").trim();
      const requirementText = String(record.requirementText ?? "").trim();
      const importance = String(record.importance ?? "").trim();

      if (!requirementKey || !requirementText) {
        throw new Error(`Job requirement ${index} is missing stable fields`);
      }

      if (!["high", "medium", "low"].includes(importance)) {
        throw new Error(`Job requirement ${index} has invalid importance`);
      }

      return {
        requirementKey,
        requirementText,
        importance: importance as StructuredJobRequirement["importance"],
      };
    });
  }
}
