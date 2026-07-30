import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type { IngestionSchedulerConfig } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { isSecondsCronExpressionValid } from "./cron-utils";

const GLOBAL_CONFIG_ID = "global";

export type EnrichmentConfigUpdateInput = {
  enrichmentBatchSize?: number;
  enrichmentCronExpression?: string;
  enrichmentEnabled?: boolean;
};

type EnrichmentConfigServiceOptions = {
  cacheTtlMs?: number;
  now?: () => number;
};

export const ENRICHMENT_CONFIG_SERVICE_OPTIONS =
  "ENRICHMENT_CONFIG_SERVICE_OPTIONS";

function isPrismaUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

@Injectable()
export class EnrichmentConfigService {
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cache: {
    config: IngestionSchedulerConfig;
    expiresAt: number;
  } | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional()
    @Inject(ENRICHMENT_CONFIG_SERVICE_OPTIONS)
    options: EnrichmentConfigServiceOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  async getConfig(): Promise<IngestionSchedulerConfig> {
    const cached = this.cache;
    if (cached && cached.expiresAt > this.now()) {
      return cached.config;
    }

    const config = await this.loadOrCreateConfig();
    this.cache = { config, expiresAt: this.now() + this.cacheTtlMs };
    return config;
  }

  invalidateCache() {
    this.cache = null;
  }

  async updateConfig(
    input: EnrichmentConfigUpdateInput,
  ): Promise<IngestionSchedulerConfig> {
    if (
      input.enrichmentCronExpression &&
      !isSecondsCronExpressionValid(input.enrichmentCronExpression)
    ) {
      throw new BadRequestException(
        "enrichmentCronExpression must be a valid 6-field (with seconds) cron expression",
      );
    }

    if (
      input.enrichmentBatchSize !== undefined &&
      (!Number.isInteger(input.enrichmentBatchSize) ||
        input.enrichmentBatchSize < 1)
    ) {
      throw new BadRequestException(
        "enrichmentBatchSize must be a positive integer",
      );
    }

    const data = {
      enrichmentBatchSize: input.enrichmentBatchSize,
      enrichmentCronExpression: input.enrichmentCronExpression,
      enrichmentEnabled: input.enrichmentEnabled,
    };

    const updated = await this.database.ingestionSchedulerConfig.upsert({
      where: { id: GLOBAL_CONFIG_ID },
      update: data,
      create: { id: GLOBAL_CONFIG_ID, ...data },
    });

    this.invalidateCache();
    return updated;
  }

  private async loadOrCreateConfig(): Promise<IngestionSchedulerConfig> {
    try {
      return await this.database.ingestionSchedulerConfig.upsert({
        where: { id: GLOBAL_CONFIG_ID },
        update: {},
        create: { id: GLOBAL_CONFIG_ID },
      });
    } catch (error) {
      if (!isPrismaUniqueViolation(error)) {
        throw error;
      }

      const config = await this.database.ingestionSchedulerConfig.findUnique({
        where: { id: GLOBAL_CONFIG_ID },
      });

      if (!config) {
        throw error;
      }

      return config;
    }
  }
}
