import { Inject, Injectable } from "@nestjs/common";
import type {
  AnalysisProtectionEventName,
  BusinessFunnelEventName,
} from "../analysis-observability/analysis-event-version.registry";
import { sanitizeAnalyticsPayload } from "../common/analytics-sanitization";
import { PosthogClientService } from "./posthog-client.service";
import type { PostHogEventSource } from "./types";

const BUSINESS_FUNNEL_EVENT_MAPPING: Record<BusinessFunnelEventName, string> = {
  landing_cta_click: "landing_cta_click",
  page_view: "page_view",
  page_leave: "page_leave",
  site_exit: "site_exit",
  session_started: "session_started",
  session_engaged: "session_engaged",
  cv_upload_completed: "cv_upload_completed",
  job_description_focus: "job_description_focus",
  job_description_paste: "job_description_paste",
  job_description_filled: "job_description_filled",
  analyze_submit_clicked: "analyze_submit_clicked",
  auth_session_identified: "auth_session_identified",
  auth_oauth_redirect_started: "auth_oauth_redirect_started",
  analysis_started: "analysis_started",
  analysis_completed: "analysis_completed",
  analysis_failed: "analysis_failed",
  analysis_result_viewed: "analysis_result_viewed",
  blog_cta_clicked: "blog_cta_clicked",
  blog_index_viewed: "blog_index_viewed",
  blog_post_viewed: "blog_post_viewed",
  seo_page_cta_clicked: "seo_page_cta_clicked",
  seo_page_viewed: "seo_page_viewed",
  teaser_scroll: "teaser_scroll",
  teaser_viewed: "teaser_viewed",
  signup_started: "signup_started",
  cta_signup_click: "cta_signup_click",
  buy_credits_clicked: "buy_credits_clicked",
  signup_completed: "signup_completed",
  login_completed: "login_completed",
  full_analysis_viewed: "full_analysis_viewed",
  optimized_cv_downloaded: "optimized_cv_downloaded",
  unlock_cv_click: "unlock_cv_click",
  checkout_abandoned: "checkout_abandoned",
  checkout_started: "checkout_started",
  checkout_brick_ready: "checkout_brick_ready",
  checkout_brick_submit_started: "checkout_brick_submit_started",
  checkout_brick_submit_failed: "checkout_brick_submit_failed",
  cv_unlock_completed: "cv_unlock_completed",
  cv_unlock_started: "cv_unlock_started",
  payment_approved: "payment_approved",
  payment_failed: "payment_failed",
  payment_return_viewed: "payment_return_viewed",
  plan_selected: "plan_selected",
  site_exit_candidate: "site_exit_candidate",
  dashboard_viewed: "dashboard_viewed",
  // Radar
  radar_view: "radar_view",
  radar_opportunity_clicked: "radar_opportunity_clicked",
  job_detail_viewed: "job_detail_viewed",
  // Meu Monitor
  monitor_view: "monitor_view",
  monitor_profile_viewed: "monitor_profile_viewed",
  monitor_profile_updated: "monitor_profile_updated",
  monitor_recommendation_viewed: "monitor_recommendation_viewed",
  monitor_recommendation_clicked: "monitor_recommendation_clicked",
  monitor_recommendation_saved: "monitor_recommendation_saved",
  monitor_recommendation_dismissed: "monitor_recommendation_dismissed",
  monitor_recommendation_feedback: "monitor_recommendation_feedback",
  monitor_application_started: "monitor_application_started",
  monitor_alert_frequency_changed: "monitor_alert_frequency_changed",
  monitor_digest_sent: "monitor_digest_sent",
  monitor_digest_delivered: "monitor_digest_delivered",
  monitor_digest_opened: "monitor_digest_opened",
  monitor_digest_clicked: "monitor_digest_clicked",
  monitor_digest_bounced: "monitor_digest_bounced",
  monitor_digest_complained: "monitor_digest_complained",
  monitor_digest_unsubscribed: "monitor_digest_unsubscribed",
  // Candidaturas
  candidaturas_page_viewed: "candidaturas_page_viewed",
  candidatura_created: "candidatura_created",
  candidatura_detail_viewed: "candidatura_detail_viewed",
  candidatura_status_changed: "candidatura_status_changed",
  candidatura_marked_as_applied: "candidatura_marked_as_applied",
  candidatura_archived: "candidatura_archived",
  candidatura_deleted: "candidatura_deleted",
  candidatura_note_added: "candidatura_note_added",
  candidatura_rejection_feedback_submitted:
    "candidatura_rejection_feedback_submitted",
  // Interview Prep
  interview_prep_drawer_opened: "interview_prep_drawer_opened",
  interview_prep_generate_clicked: "interview_prep_generate_clicked",
  interview_prep_generated: "interview_prep_generated",
  interview_prep_viewed: "interview_prep_viewed",
  interview_prep_printed: "interview_prep_printed",
  // Cover Letter
  cover_letter_generate_clicked: "cover_letter_generate_clicked",
  cover_letter_generated: "cover_letter_generated",
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
    return sanitizeAnalyticsPayload(properties);
  }
}
