import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";

import { getAiModel } from "../common/ai-client-factory";
import { DatabaseService } from "../database/database.service";
import {
  buildCanonicalJobHash,
  buildRawJobHash,
  buildRequirementSourceHash,
  type CanonicalJobJson,
  normalizeRawJobText,
} from "./job-canonicalization";

const JOB_CANONICALIZATION_PROMPT_VERSION = "2026-06-09.v1";

export type CanonicalJobLookupResult = {
  canonicalJobId: string;
  rawJobHash: string;
  canonicalJobHash: string;
  requirementSourceHash: string;
  canonicalJobJson: CanonicalJobJson;
  reusedByRawHash: boolean;
  reusedByCanonicalHash: boolean;
};

type CanonicalJobRecord = {
  id: string;
  canonicalJobHash: string;
  requirementSourceHash: string;
  canonicalJobJson: unknown;
};

type JobRawInputRecord = {
  rawJobHash: string;
  canonicalJob: CanonicalJobRecord;
};

type CanonicalizationClient = {
  canonicalize(input: {
    jobDescriptionText: string;
    model: string;
  }): Promise<CanonicalJobJson>;
  promptVersion?: string;
};

@Injectable()
export class JobCanonicalizationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject("JOB_CANONICALIZATION_AI_CLIENT") private readonly aiClient: OpenAI,
    @Optional()
    @Inject("JOB_CANONICALIZATION_CLIENT")
    private readonly canonicalizationClient?: CanonicalizationClient,
  ) {}

  async getOrCreateCanonicalJob(
    jobDescriptionText: string,
  ): Promise<CanonicalJobLookupResult> {
    const normalizedRawText = normalizeRawJobText(jobDescriptionText);
    if (normalizedRawText.length === 0) {
      throw new Error("jobDescriptionText is empty after normalization");
    }

    const rawJobHash = buildRawJobHash(normalizedRawText);
    const existingRaw = await this.findRawInput(rawJobHash);
    if (existingRaw) {
      return this.mapFromRaw(existingRaw, true, false);
    }

    const model = this.getModel();
    const canonicalJobJson = await this.canonicalize(jobDescriptionText, model);
    const canonicalJobHash = buildCanonicalJobHash(canonicalJobJson);
    const requirementSourceHash = buildRequirementSourceHash(canonicalJobJson);
    const existingCanonical = await this.findCanonicalJob(canonicalJobHash);

    if (existingCanonical) {
      return this.linkRawInputToCanonicalJob({
        canonicalJob: existingCanonical,
        canonicalJobHash,
        requirementSourceHash,
        canonicalJobJson,
        jobDescriptionText,
        normalizedRawText,
        rawJobHash,
        reusedByCanonicalHash: true,
      });
    }

    try {
      const createdCanonicalJob = await this.database.canonicalJob.create({
        data: {
          canonicalJobHash,
          requirementSourceHash,
          canonicalJobJson: canonicalJobJson as Prisma.InputJsonValue,
          canonicalizationModel: model,
          canonicalizationPromptVersion: this.getPromptVersion(),
        },
      });

      await this.database.jobRawInput.create({
        data: {
          rawJobHash,
          rawText: jobDescriptionText,
          normalizedRawText,
          canonicalJobId: createdCanonicalJob.id,
        },
      });

      return {
        canonicalJobId: createdCanonicalJob.id,
        rawJobHash,
        canonicalJobHash,
        requirementSourceHash,
        canonicalJobJson,
        reusedByRawHash: false,
        reusedByCanonicalHash: false,
      };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      return this.resolveAfterUniqueConstraint({
        canonicalJobHash,
        requirementSourceHash,
        canonicalJobJson,
        jobDescriptionText,
        normalizedRawText,
        rawJobHash,
      });
    }
  }

  private async resolveAfterUniqueConstraint(input: {
    canonicalJobHash: string;
    requirementSourceHash: string;
    canonicalJobJson: CanonicalJobJson;
    jobDescriptionText: string;
    normalizedRawText: string;
    rawJobHash: string;
  }): Promise<CanonicalJobLookupResult> {
    const existingRaw = await this.findRawInput(input.rawJobHash);
    if (existingRaw) {
      return this.mapFromRaw(existingRaw, true, false);
    }

    const existingCanonical = await this.findCanonicalJob(
      input.canonicalJobHash,
    );
    if (!existingCanonical) {
      throw new Error(
        "Failed to resolve canonical job after unique constraint",
      );
    }

    return this.linkRawInputToCanonicalJob({
      canonicalJob: existingCanonical,
      canonicalJobHash: input.canonicalJobHash,
      requirementSourceHash: input.requirementSourceHash,
      canonicalJobJson: input.canonicalJobJson,
      jobDescriptionText: input.jobDescriptionText,
      normalizedRawText: input.normalizedRawText,
      rawJobHash: input.rawJobHash,
      reusedByCanonicalHash: true,
    });
  }

  private async linkRawInputToCanonicalJob(input: {
    canonicalJob: CanonicalJobRecord;
    canonicalJobHash: string;
    requirementSourceHash: string;
    canonicalJobJson: CanonicalJobJson;
    jobDescriptionText: string;
    normalizedRawText: string;
    rawJobHash: string;
    reusedByCanonicalHash: boolean;
  }): Promise<CanonicalJobLookupResult> {
    try {
      await this.database.jobRawInput.create({
        data: {
          rawJobHash: input.rawJobHash,
          rawText: input.jobDescriptionText,
          normalizedRawText: input.normalizedRawText,
          canonicalJobId: input.canonicalJob.id,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const existingRaw = await this.findRawInput(input.rawJobHash);
      if (existingRaw) {
        return this.mapFromRaw(existingRaw, true, false);
      }
    }

    return {
      canonicalJobId: input.canonicalJob.id,
      rawJobHash: input.rawJobHash,
      canonicalJobHash: input.canonicalJobHash,
      requirementSourceHash: input.requirementSourceHash,
      canonicalJobJson: input.canonicalJobJson,
      reusedByRawHash: false,
      reusedByCanonicalHash: input.reusedByCanonicalHash,
    };
  }

  private async findRawInput(
    rawJobHash: string,
  ): Promise<JobRawInputRecord | null> {
    return this.database.jobRawInput.findUnique({
      where: { rawJobHash },
      include: {
        canonicalJob: {
          select: {
            id: true,
            canonicalJobHash: true,
            requirementSourceHash: true,
            canonicalJobJson: true,
          },
        },
      },
    });
  }

  private async findCanonicalJob(
    canonicalJobHash: string,
  ): Promise<CanonicalJobRecord | null> {
    return this.database.canonicalJob.findUnique({
      where: { canonicalJobHash },
      select: {
        id: true,
        canonicalJobHash: true,
        requirementSourceHash: true,
        canonicalJobJson: true,
      },
    });
  }

  private async canonicalize(
    jobDescriptionText: string,
    model: string,
  ): Promise<CanonicalJobJson> {
    if (this.canonicalizationClient) {
      return this.canonicalizationClient.canonicalize({
        jobDescriptionText,
        model,
      });
    }

    const { canonicalizeJobDescription } = await import("@earlycv/ai");
    return canonicalizeJobDescription(
      this.aiClient as never,
      model,
      jobDescriptionText,
    );
  }

  private getModel(): string {
    return getAiModel("JOB_CANONICALIZATION");
  }

  private getPromptVersion(): string {
    return (
      this.canonicalizationClient?.promptVersion ??
      JOB_CANONICALIZATION_PROMPT_VERSION
    );
  }

  private mapFromRaw(
    record: JobRawInputRecord,
    reusedByRawHash: boolean,
    reusedByCanonicalHash: boolean,
  ): CanonicalJobLookupResult {
    return {
      canonicalJobId: record.canonicalJob.id,
      rawJobHash: record.rawJobHash,
      canonicalJobHash: record.canonicalJob.canonicalJobHash,
      requirementSourceHash: record.canonicalJob.requirementSourceHash,
      canonicalJobJson: record.canonicalJob
        .canonicalJobJson as CanonicalJobJson,
      reusedByRawHash,
      reusedByCanonicalHash,
    };
  }

  private isUniqueConstraintError(error: unknown): error is { code: string } {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002",
    );
  }
}
