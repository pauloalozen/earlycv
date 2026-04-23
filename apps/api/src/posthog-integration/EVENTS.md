# PostHog Integration - Event Mapping

## Overview

This document describes the event mapping between EarlyCV's internal events and PostHog events.

## Business Funnel Events

The following business funnel events are exported to PostHog:

| EarlyCV Event | PostHog Event | Description |
|--------------|---------------|-------------|
| `landing_view` | `landing_view` | User viewed the landing page |
| `landing_cta_click` | `landing_cta_click` | User clicked CTA on landing |
| `adapt_page_view` | `adapt_page_view` | User viewed the adapt page |
| `cv_upload_started` | `cv_upload_started` | User started CV upload |
| `cv_upload_completed` | `cv_upload_completed` | User completed CV upload |
| `job_description_filled` | `job_description_filled` | User filled job description |
| `analyze_submit_clicked` | `analyze_submit_clicked` | User submitted for analysis |
| `analysis_started` | `analysis_started` | Analysis began processing |
| `teaser_viewed` | `teaser_viewed` | User viewed analysis teaser |
| `signup_started` | `signup_started` | User started signup |
| `signup_completed` | `signup_completed` | User completed signup |
| `login_completed` | `login_completed` | User completed login |
| `full_analysis_viewed` | `full_analysis_viewed` | User viewed full analysis |
| `unlock_cv_click` | `unlock_cv_click` | User clicked to unlock CV |
| `checkout_started` | `checkout_started` | User started checkout |
| `purchase_completed` | `purchase_completed` | Purchase completed |
| `dashboard_viewed` | `dashboard_viewed` | User viewed dashboard |

## Protection Events

The following protection events are exported to PostHog. Events are prefixed with `protection_` or `analysis_`:

| EarlyCV Event | PostHog Event | Description |
|--------------|---------------|-------------|
| `turnstile_invalid` | `protection_turnstile_invalid` | Turnstile validation failed |
| `turnstile_missing` | `protection_turnstile_missing` | Turnstile token missing |
| `turnstile_expired` | `protection_turnstile_expired` | Turnstile token expired |
| `turnstile_valid` | `protection_turnstile_valid` | Turnstile validation passed |
| `rate_limit_block_initial` | `protection_rate_limit_block_initial` | Initial rate limit blocked |
| `rate_limit_block_contextual` | `protection_rate_limit_block_contextual` | Contextual rate limit blocked |
| `duplicate_request_blocked` | `protection_duplicate_request_blocked` | Duplicate request blocked |
| `daily_limit_block` | `protection_daily_limit_block` | Daily limit reached |
| `abuse_detected` | `protection_abuse_detected` | Abuse pattern detected |
| `openai_request_started` | `analysis_request_started` | Analysis request started |
| `openai_request_success` | `analysis_request_success` | Analysis request succeeded |
| `openai_request_failed` | `analysis_request_failed` | Analysis request failed |
| `cache_hit` | `analysis_cache_hit` | Cache hit |
| `cache_miss` | `analysis_cache_miss` | Cache miss |

## Events NOT Exported

The following events are intentionally NOT exported to PostHog to avoid noise:

- Internal technical events (e.g., `cooldown_block`, `kill_switch_passed`)
- Events that don't provide actionable insights
- Duplicate or redundant information

## Data Privacy

The following fields are never sent to PostHog:
- `sessionPublicToken`
- `token`
- `secret`
- `apiKey`
- `password`
- `authorization`
- `cvContent`
- `cvText`
- `resumeContent`

Sensitive fields are hashed before sending.

## Source Tracking

All events include a `source` property indicating:
- `frontend` - Event originated from web app
- `backend` - Event originated from API

## Event Version

All events include `event_version` for tracking schema changes.