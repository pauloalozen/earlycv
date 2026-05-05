import { Inject, Injectable, Logger } from "@nestjs/common";
import { PostHog, type EventMessage } from "posthog-node";
import { POSTHOG_INTEGRATION_CONFIG } from "./types";
import type { PosthogIntegrationConfig } from "./types";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const ANALYTICS_APP = "earlycv" as const;

type AnalyticsEnv = "production" | "staging" | "development";

function normalizeCandidate(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized;
}

function resolveAnalyticsEnv(input: {
  appEnv?: string | null;
  platformEnv?: string | null;
  nodeEnv?: string | null;
}): AnalyticsEnv {
  const candidate =
    normalizeCandidate(input.appEnv) ??
    normalizeCandidate(input.platformEnv) ??
    normalizeCandidate(input.nodeEnv);

  if (candidate === "production") {
    return "production";
  }

  if (candidate === "staging" || candidate === "preview") {
    return "staging";
  }

  return "development";
}

export function resolvePosthogHost(projectId: string): string {
  const raw = projectId.trim();

  if (!raw) {
    return DEFAULT_POSTHOG_HOST;
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  if (/^\d+$/.test(raw)) {
    return DEFAULT_POSTHOG_HOST;
  }

  if (raw.includes(".")) {
    return `https://${raw}`;
  }

  return DEFAULT_POSTHOG_HOST;
}

@Injectable()
export class PosthogClientService {
  private readonly logger = new Logger(PosthogClientService.name);
  private client: PostHog | null = null;
  private readonly config: PosthogIntegrationConfig;
  private isConfigured = false;

  constructor(
    @Inject(POSTHOG_INTEGRATION_CONFIG)
    config: PosthogIntegrationConfig,
  ) {
    this.config = config;
    this.initialize();
  }

  private initialize() {
    if (!this.config.enabled) {
      this.logger.log("PostHog integration is disabled");
      return;
    }

    if (!this.config.apiKey) {
      this.logger.warn("PostHog API key not configured, integration disabled");
      return;
    }

    try {
      const host = resolvePosthogHost(this.config.projectId);
      this.client = new PostHog(this.config.apiKey, {
        host,
        flushAt: this.config.maxBatchSize,
        flushInterval: this.config.flushIntervalMs,
      });
      this.isConfigured = true;
      this.logger.log("PostHog client initialized successfully");
    } catch (error) {
      this.logger.error(`Failed to initialize PostHog client: ${error}`);
      this.isConfigured = false;
    }
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    if (!this.isConfigured || !this.client) {
      return;
    }

    try {
      const env = resolveAnalyticsEnv({
        appEnv: process.env.APP_ENV,
        platformEnv: process.env.RAILWAY_ENVIRONMENT_NAME,
        nodeEnv: process.env.NODE_ENV,
      });
      const message: EventMessage = {
        distinctId:
          (properties?.user_id as string) ??
          (properties?.userId as string) ??
          (properties?.distinct_id as string) ??
          (properties?.$session_id as string) ??
          (properties?.sessionInternalId as string) ??
          (properties?.session_internal_id as string) ??
          "anonymous",
        event,
        properties: {
          ...(properties ?? {}),
          app: ANALYTICS_APP,
          env,
        },
      };

      this.client.capture(message);
    } catch (error) {
      this.logger.warn(`Failed to capture event ${event}: ${error}`);
    }
  }

  async flush(): Promise<void> {
    if (!this.isConfigured || !this.client) {
      return;
    }

    try {
      await this.client.flush();
    } catch (error) {
      this.logger.warn(`Failed to flush PostHog events: ${error}`);
    }
  }

  onShutdown(): void {
    if (!this.client) {
      return;
    }

    this.client.shutdown();
  }
}
