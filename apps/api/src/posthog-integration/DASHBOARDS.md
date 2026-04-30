# PostHog Dashboards - Setup Instructions

## Overview

This document provides instructions for creating dashboards in PostHog for the EarlyCV application.

## Prerequisites

1. PostHog account with project created
2. API key configured in environment

## Dashboard 1: Conversion / Funil

### Purpose
Track the main sales funnel and user conversion journey.

### Events to Use
- `landing_view`
- `landing_cta_click`
- `adapt_page_view`
- `cv_upload_started`
- `cv_upload_completed`
- `job_description_filled`
- `analyze_submit_clicked`
- `analysis_started`
- `teaser_viewed`
- `signup_started`
- `signup_completed`
- `full_analysis_viewed`
- `checkout_started`
- `purchase_completed`

### Suggested Visualizations

#### Funnel Chart
Create a funnel visualization with sequential steps:
1. `landing_view` → `landing_cta_click` → `adapt_page_view` → `cv_upload_started` → `cv_upload_completed` → `analyze_submit_clicked` → `teaser_viewed` → `signup_completed` → `checkout_started` → `purchase_completed`

#### Key Metrics (Trends)
- Daily event counts for each conversion event
- Conversion rate between steps
- Unique users per day

#### Segmentations
- By `source` property (frontend vs backend)
- By user authentication state (user_id present vs null)

## Dashboard 2: Operation / Security / Protection

### Purpose
Track protection effectiveness, abuse prevention, and cost avoidance.

### Events to Use
- `protection_turnstile_invalid`
- `protection_turnstile_missing`
- `protection_rate_limit_block_initial`
- `protection_rate_limit_block_contextual`
- `protection_duplicate_request_blocked`
- `protection_daily_limit_block`
- `protection_abuse_detected`
- `analysis_request_started`
- `analysis_request_success`
- `analysis_request_failed`
- `analysis_cache_hit`
- `analysis_cache_miss`

### Suggested Visualizations

#### Trends Chart
- Daily counts of each protection event
- Blocked requests over time
- Cache hit/miss ratio

#### Key Metrics
- Total blocked requests (sum of all protection_* events)
- Analysis request success rate
- Cache effectiveness (cache_hit / (cache_hit + cache_miss))

#### Alerts to Configure
- Spike in `protection_abuse_detected`
- Spike in `protection_rate_limit_block_contextual`
- Spike in `analysis_request_failed`
- Drop in `analysis_request_success`

## Dashboard 3: Analysis Health

### Purpose
Track analysis execution health and performance.

### Events to Use
- `analysis_request_started`
- `analysis_request_success`
- `analysis_request_failed`
- `analysis_cache_hit`
- `analysis_cache_miss`

### Suggested Visualizations

#### Trends Chart
- Daily analysis requests (started, success, failed)
- Failure rate over time
- Cache hit/miss ratio

#### Key Metrics
- Success rate: `analysis_request_success` / `analysis_request_started`
- Failure rate: `analysis_request_failed` / `analysis_request_started`
- Cache efficiency: `analysis_cache_hit` / (`analysis_cache_hit` + `analysis_cache_miss`)

#### Alerts to Configure
- Spike in `analysis_request_failed`
- Drop in `analysis_request_success`
- Drop in cache hit rate

## Alert Configuration

### Recommended Alerts

| Alert Name | Metric | Condition |
|-----------|-------|----------|
| Purchase Drop | `purchase_completed` (weekly) | Drop > 30% |
| Signup Drop | `signup_completed` (daily) | Drop > 20% |
| Analysis Failure Spike | `analysis_request_failed` (daily) | Increase > 50% |
| Abuse Spike | `protection_abuse_detected` (daily) | Increase > 100% |
| Rate Limit Spike | `protection_rate_limit_block_contextual` | Increase > 50% |

## Filter Properties

All dashboards should filter by:
- `env`: `production` for official business dashboards
- `source`: `frontend` or `backend`
- Date range: Last 7 days, 30 days, custom

For debugging dashboards, prefer:
- `env = development` for local validation
- `env = staging` for preview checks

Ignore legacy events without `env` in official reporting (they were emitted before environment tagging became mandatory).

## Notes

- PostHog is a consumer of events, not the source of truth
- Always verify data against database for critical metrics
- Dashboards supplement (not replace) internal analytics
