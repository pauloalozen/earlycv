import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { isCronExpressionValid } from "./cron-utils";
import type { UpdateGlobalSchedulerDto } from "./dto/update-global-scheduler.dto";

const GLOBAL_CONFIG_ID = "global";

function isPrismaUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

@Injectable()
export class GlobalSchedulerConfigService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getConfig() {
    try {
      return await this.database.ingestionSchedulerConfig.upsert({
        where: { id: GLOBAL_CONFIG_ID },
        update: {},
        create: {
          id: GLOBAL_CONFIG_ID,
        },
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

  async updateConfig(dto: UpdateGlobalSchedulerDto) {
    const timezone = dto.timezone ?? "America/Sao_Paulo";

    if (timezone !== "America/Sao_Paulo") {
      throw new BadRequestException("only America/Sao_Paulo is supported");
    }

    if (dto.enabled && !dto.globalCron) {
      throw new BadRequestException("globalCron is required when enabled");
    }

    if (dto.globalCron && !isCronExpressionValid(dto.globalCron)) {
      throw new BadRequestException("invalid cron expression");
    }

    try {
      return await this.database.ingestionSchedulerConfig.upsert({
        where: { id: GLOBAL_CONFIG_ID },
        update: {
          enabled: dto.enabled,
          errorDelayMs: dto.errorDelayMs,
          globalCron: dto.globalCron ?? null,
          normalDelayMs: dto.normalDelayMs,
          timezone,
        },
        create: {
          enabled: dto.enabled,
          errorDelayMs: dto.errorDelayMs,
          globalCron: dto.globalCron ?? null,
          id: GLOBAL_CONFIG_ID,
          normalDelayMs: dto.normalDelayMs,
          timezone,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueViolation(error)) {
        throw error;
      }

      return this.database.ingestionSchedulerConfig.update({
        where: { id: GLOBAL_CONFIG_ID },
        data: {
          enabled: dto.enabled,
          errorDelayMs: dto.errorDelayMs,
          globalCron: dto.globalCron ?? null,
          normalDelayMs: dto.normalDelayMs,
          timezone,
        },
      });
    }
  }
}
