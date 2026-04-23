import { Inject, Injectable } from "@nestjs/common";
import type {
  AnalysisProtectionEventName,
  BusinessFunnelEventName,
} from "../analysis-observability/analysis-event-version.registry";
import { PosthogClientService } from "./posthog-client.service";
import type { PostHogEventSource } from "./types";

const BUSINESS_FUNNEL_EVENT_MAPPING: Record<BusinessFunnelEventName, string> = {
  landing_view: "landing_view",
  landing_cta_click: "landing_cta_click",
  adapt_page_view: "adapt_page_view",
  page_view: "page_view",
  page_leave: "page_leave",
  session_started: "session_started",
  session_engaged: "session_engaged",
  cv_upload_started: "cv_upload_started",
  cv_upload_clicked: "cv_upload_clicked",
  cv_upload_completed: "cv_upload_completed",
  job_description_focus: "job_description_focus",
  job_description_paste: "job_description_paste",
  job_description_filled: "job_description_filled",
  analyze_submit_clicked: "analyze_submit_clicked",
  analysis_started: "analysis_started",
  teaser_scroll: "teaser_scroll",
  teaser_viewed: "teaser_viewed",
  signup_started: "signup_started",
  cta_signup_click: "cta_signup_click",
  signup_completed: "signup_completed",
  login_completed: "login_completed",
  full_analysis_viewed: "full_analysis_viewed",
  download_cv_clicked: "download_cv_clicked",
  unlock_cv_click: "unlock_cv_click",
  checkout_abandoned: "checkout_abandoned",
  checkout_started: "checkout_started",
  payment_failed: "payment_failed",
  purchase_completed: "purchase_completed",
  dashboard_viewed: "dashboard_viewed",
};

const PROTECTION_EVENT_MAPPING: Record<AnalysisProtectionEventName, string> = {
  canonical_hash_generated: "protection_canonical_hash_generated",
  turnstile_invalid: "protection_turnstile_invalid",
  turnstile_missing: "protection_turnstile_missing",
  turnstile_expired: "protection_turnstile_expired",
  turnstile_valid: "protection_turnstile_valid",
  turnstile_unavailable: "protection_turnstile_unavailable",
  turnstile_unconfigured: "protection_turnstile_unconfigured",
  rate_limit_block_initial: "protection_rate_limit_block_initial",
  rate_limit_block_contextual: "protection_rate_limit_block_contextual",
  rate_limit_raw_passed: "protection_rate_limit_raw_passed",
  rate_limit_contextual_passed: "protection_rate_limit_contextual_passed",
  dedupe_lock_acquired: "protection_dedupe_lock_acquired",
  duplicate_request_blocked: "protection_duplicate_request_blocked",
  daily_limit_block: "protection_daily_limit_block",
  abuse_detected: "protection_abuse_detected",
  openai_request_started: "analysis_request_started",
  openai_request_success: "analysis_request_success",
  openai_request_failed: "analysis_request_failed",
  cache_hit: "analysis_cache_hit",
  cache_miss: "analysis_cache_miss",
  cooldown_block: "protection_cooldown_block",
  kill_switch_blocked: "protection_kill_switch_blocked",
  kill_switch_passed: "protection_kill_switch_passed",
  usage_policy_passed: "protection_usage_policy_passed",
  payload_valid: "protection_payload_valid",
  payload_invalid: "protection_payload_invalid",
};

const SENSITIVE_FIELDS = [
  "sessionPublicToken",
  "token",
  "secret",
  "apiKey",
  "password",
  "authorization",
] as const;

const ALWAYS_EXCLUDED_META_FIELDS = [
  "sessionPublicToken",
  "token",
  "secret",
  "apiKey",
  "password",
  "authorization",
  "cvContent",
  "cvText",
  "resumeContent",
] as const;

@Injectable()
export class PosthogEventExporter {
  constructor(
    @Inject(PosthogClientService)
    private readonly posthog: PosthogClientService,
  ) {}

  shouldExportBusinessFunnelEvent(eventName: string): boolean {
    return eventName in BUSINESS_FUNNEL_EVENT_MAPPING;
  }

  shouldExportProtectionEvent(eventName: string): boolean {
    return eventName in PROTECTION_EVENT_MAPPING;
  }

  exportBusinessFunnelEvent(
    eventName: BusinessFunnelEventName,
    properties: Record<string, unknown>,
    source: PostHogEventSource = "backend",
  ): void {
    if (!this.posthog.isEnabled()) {
      return;
    }

    const mappedEventName = BUSINESS_FUNNEL_EVENT_MAPPING[eventName];
    if (!mappedEventName) {
      return;
    }

    const sanitizedProperties = this.sanitizeProperties(properties);

    this.posthog.capture(mappedEventName, {
      ...sanitizedProperties,
      source,
    });
  }

  exportProtectionEvent(
    eventName: AnalysisProtectionEventName,
    properties: Record<string, unknown>,
    source: PostHogEventSource = "backend",
  ): void {
    if (!this.posthog.isEnabled()) {
      return;
    }

    const mappedEventName = PROTECTION_EVENT_MAPPING[eventName];
    if (!mappedEventName) {
      return;
    }

    const sanitizedProperties = this.sanitizeProperties(properties);

    this.posthog.capture(mappedEventName, {
      ...sanitizedProperties,
      source,
    });
  }

  private sanitizeProperties(
    properties: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    if (!properties || typeof properties !== "object") {
      return sanitized;
    }

    const entries = Object.entries(properties).filter(([key]) => {
      const lowerKey = key.toLowerCase();
      return !ALWAYS_EXCLUDED_META_FIELDS.some(
        (excluded) => excluded.toLowerCase() === lowerKey,
      );
    });

    for (const [key, value] of entries) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = this.hashValue(String(value));
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private isSensitiveField(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return SENSITIVE_FIELDS.some(
      (sensitive) => sensitive.toLowerCase() === lowerKey,
    );
  }

  private hashValue(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `***hashed:${Math.abs(hash).toString(16)}`;
  }
}
