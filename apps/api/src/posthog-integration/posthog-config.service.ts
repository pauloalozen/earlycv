import { Injectable, Logger } from "@nestjs/common";
import { PosthogClientService } from "./posthog-client.service";
import { POSTHOG_INTEGRATION_CONFIG } from "./types";
import type { PosthogIntegrationConfig } from "./types";

function envToBoolean(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envToNumber(value: string): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

@Injectable()
export class PostHogConfigService {
  private readonly logger = new Logger(PostHogConfigService.name);

  getConfig(): PosthogIntegrationConfig {
    const apiKey = process.env.POSTHOG_API_KEY ?? "";
    const projectId = process.env.POSTHOG_PROJECT_ID ?? "";
    const enabled = envToBoolean(process.env.POSTHOG_ENABLED ?? "false");
    const flushIntervalMs = envToNumber(process.env.POSTHOG_FLUSH_INTERVAL_MS ?? "5000");
    const maxBatchSize = envToNumber(process.env.POSTHOG_MAX_BATCH_SIZE ?? "50");

    return {
      apiKey,
      projectId,
      enabled,
      flushIntervalMs,
      maxBatchSize,
    };
  }
}