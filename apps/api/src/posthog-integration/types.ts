export const POSTHOG_INTEGRATION_CONFIG = Symbol("POSTHOG_INTEGRATION_CONFIG");

export const POSTHOG_INTEGRATION_CONFIG_PREFIX = "POSTHOG_";

export type PostHogEventSource = "backend" | "frontend";

export interface PostHogEvent {
  event: string;
  properties: PostHogEventProperties;
  timestamp: string;
}

export interface PostHogEventProperties {
  event_version?: number;
  request_id?: string;
  correlation_id?: string;
  session_internal_id?: string | null;
  user_id?: string | null;
  route_key?: string | null;
  source?: PostHogEventSource;
  $ip?: never;
  $timezone?: never;
}

export interface PosthogIntegrationConfig {
  apiKey: string;
  projectId: string;
  enabled: boolean;
  flushIntervalMs: number;
  maxBatchSize: number;
}

export const POSTHOG_INTEGRATION_SCHEMA = {
  api_key: {
    default: "",
    risk: "high",
    type: "string",
  },
  project_id: {
    default: "",
    risk: "high",
    type: "string",
  },
  enabled: {
    default: false,
    risk: "medium",
    type: "boolean",
  },
  flush_interval_ms: {
    default: 5000,
    max: 60000,
    min: 1000,
    risk: "low",
    type: "int",
  },
  max_batch_size: {
    default: 50,
    max: 200,
    min: 1,
    risk: "low",
    type: "int",
  },
} as const;

export type PostHogIntegrationConfigKey = keyof typeof POSTHOG_INTEGRATION_SCHEMA;