Hoje vocês têm 52 eventos de log/telemetria versionados (todos v1):

AnalysisProtectionEvent (27)

- abuse_detected
- cache_hit
- cache_miss
- canonical_hash_generated
- cooldown_block
- daily_limit_block
- dedupe_lock_acquired
- duplicate_request_blocked
- kill_switch_blocked
- kill_switch_passed
- openai_request_failed
- openai_request_started
- openai_request_success
- payload_invalid
- payload_valid
- rate_limit_block_contextual
- rate_limit_block_initial
- rate_limit_contextual_passed
- rate_limit_raw_passed
- turnstile_expired
- turnstile_invalid
- turnstile_missing
- turnstile_unavailable
- turnstile_unconfigured
- turnstile_valid
- usage_policy_passed

BusinessFunnelEvent (25)

- analysis_started
- analyze_submit_clicked
- cta_signup_click
- checkout_abandoned
- checkout_started
- cv_upload_completed
- dashboard_viewed
- optimized_cv_downloaded
- full_analysis_viewed
- job_description_focus
- job_description_filled
- job_description_paste
- landing_cta_click
- login_completed
- page_leave
- page_view
- payment_approved
- payment_failed
- session_engaged
- session_started
- signup_completed
- signup_started
- teaser_scroll
- teaser_viewed
- unlock_cv_click  


Também existem os 2 canais internos de emissão no listener:

- posthog:business-funnel-event-emitted
- posthog:protection-event-emitted  
  (em apps/api/src/posthog-integration/posthog-event-listener.ts)
