export const ANALYSIS_PROTECTION_EVENT_VERSION_MAP = {
  abuse_detected: 1,
  cache_hit: 1,
  cache_miss: 1,
  canonical_hash_generated: 1,
  cooldown_block: 1,
  daily_limit_block: 1,
  dedupe_lock_acquired: 1,
  duplicate_request_blocked: 1,
  kill_switch_blocked: 1,
  kill_switch_passed: 1,
  openai_request_failed: 1,
  openai_request_started: 1,
  openai_request_success: 1,
  payload_invalid: 1,
  payload_valid: 1,
  rate_limit_block_contextual: 1,
  rate_limit_block_initial: 1,
  rate_limit_contextual_passed: 1,
  rate_limit_raw_passed: 1,
  turnstile_expired: 1,
  turnstile_invalid: 1,
  turnstile_missing: 1,
  turnstile_unavailable: 1,
  turnstile_unconfigured: 1,
  turnstile_valid: 1,
  usage_policy_passed: 1,
} as const;

export type AnalysisProtectionEventName =
  keyof typeof ANALYSIS_PROTECTION_EVENT_VERSION_MAP;

export const BUSINESS_FUNNEL_EVENT_VERSION_MAP = {
  analysis_started: 1,
  analyze_submit_clicked: 1,
  auth_session_identified: 1,
  auth_oauth_redirect_started: 1,
  blog_cta_clicked: 1,
  blog_index_viewed: 1,
  blog_post_viewed: 1,
  seo_page_cta_clicked: 1,
  seo_page_viewed: 1,
  cta_signup_click: 1,
  buy_credits_clicked: 1,
  checkout_abandoned: 1,
  checkout_started: 1,
  cv_unlock_completed: 1,
  cv_unlock_started: 1,
  cv_upload_completed: 1,
  dashboard_viewed: 1,
  optimized_cv_downloaded: 1,
  full_analysis_viewed: 1,
  job_description_focus: 1,
  job_description_filled: 1,
  job_description_paste: 1,
  landing_cta_click: 1,
  login_completed: 1,
  page_leave: 1,
  payment_return_viewed: 1,
  plan_selected: 1,
  site_exit: 1,
  site_exit_candidate: 1,
  page_view: 1,
  payment_approved: 1,
  payment_failed: 1,
  session_engaged: 1,
  session_started: 1,
  signup_completed: 1,
  signup_started: 1,
  teaser_scroll: 1,
  teaser_viewed: 1,
  unlock_cv_click: 1,
} as const;

export type BusinessFunnelEventName =
  keyof typeof BUSINESS_FUNNEL_EVENT_VERSION_MAP;

export function resolveAnalysisProtectionEventVersion(
  eventName: AnalysisProtectionEventName,
): number {
  const version = ANALYSIS_PROTECTION_EVENT_VERSION_MAP[eventName];

  if (!version) {
    throw new Error(
      `Missing event version registry entry for analysis protection event: ${eventName}`,
    );
  }

  return version;
}

export function resolveBusinessFunnelEventVersion(eventName: string) {
  const key = eventName as BusinessFunnelEventName;

  return BUSINESS_FUNNEL_EVENT_VERSION_MAP[key] ?? null;
}
