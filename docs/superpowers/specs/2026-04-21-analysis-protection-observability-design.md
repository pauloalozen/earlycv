# Analysis Protection + Observability Design (EarlyCV)

Date: 2026-04-21
Status: Proposed (approved in chat, pending final file review)
Scope: `apps/api` and minimal non-visual wiring in `apps/web`

## 1) Goals and Non-Negotiables

### Goals

- Prevent any AI call from bypassing protection rules.
- Reduce automated abuse risk.
- Control cost for expensive model usage.
- Provide full funnel observability with correlation IDs.
- Keep user experience unchanged (no new visible steps).

### Non-negotiables

- No UI/layout/copy/identity changes.
- No perceptible flow changes for users.
- Security truth lives in backend only.
- Frontend may transmit signals/tokens, never enforce security.
- No OpenAI calls outside protected wrapper.
- Protection telemetry and business telemetry remain semantically separate.

## 2) High-Level Architecture

Two modules with explicit boundaries in `apps/api`:

1. `analysis-protection`
   - Owns anti-abuse, cost control, guard rails, anti-bypass.
   - Exposes a single execution boundary:
     - `AnalysisProtectionFacade.executeProtectedAnalysis(input, context)`
2. `analysis-observability`
   - Owns business funnel events and derived funnel projections.
   - Does not enforce protection rules.

`cv-adaptation` integration:

- `CvAdaptationService` calls only the protection facade for analysis flows.
- Existing AI provider service is moved behind protected gateway usage only.
- Direct provider access from controllers/services is blocked by architecture and tests.
- Protection gates run before heavy processing (for example file parsing/text extraction) whenever the required inputs for that gate are already available.

## 3) Internal Components

### 3.1 `analysis-protection`

- `AnalysisProtectionFacade`
  - Orchestrates pipeline order.
  - No heavy policy logic.
- `AnalysisConfigService`
  - Runtime config resolution with precedence: database > env > default.
  - Computes resolved origin at runtime (not persisted as effective origin).
  - Typed parser supports boolean/int/duration/percent/list/enum/unit-explicit values.
  - Enforces range and cross-field validation.
- `AnalysisRateLimitService`
  - Stage-1 raw IP limit.
  - Stage-2 contextual limits by IP + session + user.
- `AnalysisDedupeCacheService`
  - Canonical hash generation.
  - Session/user-scoped cache.
  - Concurrency lock by hash scope.
  - Conservative anti-bot heuristic.
- `AnalysisUsagePolicyService`
  - Cooldown checks.
  - Daily limit checks.
  - Guarantees cache-hit does not consume daily quota.
- `AnalysisTelemetryService`
  - Structured protection events.
  - Idempotent event emission when applicable.
- `ProtectedAiProviderGateway`
  - Single OpenAI invocation boundary.
  - Timeout/max execution/no dangerous auto-retry/idempotency guards.

### 3.2 `analysis-observability`

- `BusinessFunnelEventService`
  - Accepts funnel events with contract versioning.
  - Supports idempotency keys where applicable.
- `BusinessFunnelProjectionService`
  - Maintains derived metrics (conversion/drop-off/time between steps/error per step).
  - Rebuildable from source events.

## 4) Data Model (Logical + Physical)

## 4.1 Protection domain (logical model)

- `AnalysisProtectionConfig`
  - Stores runtime-overridable config records.
  - Does not persist runtime effective origin.
- `AnalysisProtectionConfigAudit`
  - `actorId`, `actorRole`, `changedAt`, `key`, `oldValue`, `newValue`, `source`, `technicalContext`.
- `AnalysisSession`
  - Separates public cookie token from internal persisted representation.
  - Cookie carries public `sessionToken`; DB references `sessionInternalId` and hashed token fields.
- `AnalysisRequestFingerprint`
  - Canonical request identity and repetition stats.
  - Volatile fields (for example `lockUntil`, transient abuse flags) may live in fast operational store.
- `AnalysisUsageCounter`
  - Logical model for window counters.
  - Hot windows may be served from high-performance store; relational persistence optional/aggregated.
- `AnalysisProtectionEvent`
  - Protection stream source with `requestId` and `correlationId`.

### 4.2 Business observability domain

- `BusinessFunnelEvent`
  - Source of truth for product funnel.
  - Contains `eventVersion` and correlation fields.
- `BusinessFunnelStageMetric`
  - Derived projection only; fully reconstructible by replay.

### 4.3 Storage strategy

- PostgreSQL is primary persistent store.
- Optional fast operational store is allowed for high-contention transient state.
- Data residency, retention, and purge policies are per stream and event type.

## 5) Request Context and Forwarding

Canonical analysis context propagated through pipeline:

- `requestId`
- `correlationId`
- `ip` (resolved only from trusted proxy chain)
- `sessionPublicToken` and `sessionInternalId`
- `userId` (optional)
- route metadata and user agent hash

Rules:

- Never trust arbitrary forwarded headers without trusted proxy policy.
- Session is never sole identity; always combined with IP/user context.

## 6) Mandatory Validation Pipeline (Execution Order)

1. Structural payload validation.
2. Canonical normalization and hash generation.
3. Global kill switch / auth emergency.
4. Raw rate limit (IP-only, cheap).
5. Turnstile validation (backend).
6. Contextual rate limit (IP + sessionId + userId).
7. Dedupe/cache.
8. Cooldown.
9. Daily limit.
10. OpenAI guard rail.
11. Centralized provider call.

Fail-fast contract:

- On any failed stage: stop execution, return controlled error, emit protection telemetry, do not call OpenAI.

## 7) Turnstile Integration

Frontend:

- Invisible Turnstile token generated on submit for analysis actions.
- Token appended to existing `FormData`.
- No visible UX changes.

Backend:

- Token required for analysis endpoints.
- Validate token integrity, expiry, and expected timing/action window.
- Frontend token is input only; no client trust.

## 8) Rate Limits, Dedupe, Cache, and Anti-Bot

Raw rate limit:

- IP-only and low-cost.
- Purpose: flood cutoff.

Contextual rate limit:

- IP + session + user dimensions.
- Configurable by user type/plan.

Dedupe/cache:

- Hash from normalized CV + normalized job text + normalized params.
- Cache scope isolation by user/session context; no cross-session sharing.
- Concurrency lock per scoped hash.
- Cache hit must bypass daily quota consumption.

Conservative anti-bot heuristic:

- If same hash + very short interval + high repetition -> block.
- If human-like behavior -> serve cache (when available).
- All thresholds configurable via runtime config.

## 9) OpenAI Guard Rail and Anti-Bypass

Guard rail requirements:

- Request timeout.
- Maximum execution ceiling.
- No dangerous automatic retry loops.
- Robust error handling without duplicate calls.
- Provider call idempotency where applicable.

Anti-bypass:

- No endpoint or domain service can call AI provider directly.
- Only protected wrapper can call provider.
- Enforced by architecture and tests.

## 10) Telemetry Contracts and Semantics

Two independent streams:

- `analysis_protection_events`
- `business_funnel_events`

Both streams require:

- `eventVersion`
- `requestId`
- `correlationId`
- `sessionInternalId` (when session exists)
- `userId` (optional)
- route context
- idempotency behavior where applicable

Session telemetry rule:

- Raw public session token (`sessionPublicToken`) is forbidden in telemetry payloads and logs.
- Telemetry can carry only internal session identifiers and/or one-way derived hashes.

Semantic separation:

- Protection stream contains no business funnel semantics.
- Business stream contains no protection decision semantics beyond minimal correlation context.

### 10.1 Protection events (minimum)

- `turnstile_valid`
- `turnstile_invalid`
- `rate_limit_block_initial`
- `rate_limit_block_contextual`
- `cooldown_block`
- `daily_limit_block`
- `duplicate_request_blocked`
- `cache_hit`
- `cache_miss`
- `abuse_detected`
- `openai_request_started`
- `openai_request_success`
- `openai_request_failed`

Notes:

- `costHint` is operational/analytic estimate only, not accounting source of truth.

### 10.2 Business funnel events (minimum)

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
- `login_completed`
- `full_analysis_viewed`
- `unlock_cv_click`
- `checkout_started`
- `purchase_completed`
- `dashboard_viewed`

Emission policy:

- Prefer server-side emission for backend-confirmed actions.
- Allow complementary client-side events for pure UI interactions with no UX impact.
- Idempotency required where retries/concurrency/replay can duplicate events.

## 11) Runtime Config and Governance

Config source precedence:

- database > env > secure defaults.

Validation:

- Type validation.
- Range validation.
- Cross-config validation.
- Extreme-value protection.
- Risk classification (low/medium/high).
- Critical change restrictions by role.

Audit requirements:

- who changed
- when
- key
- old/new value
- source (UI/API/script)
- technical context

Performance:

- In-memory config cache with short TTL.
- Avoid frequent DB reads on hot path.

## 12) Backoffice (Admin/Superadmin)

- Internal protected endpoints with JWT + role guard.
- UI unchanged stylistically (simple toggle + number controls).
- Show current value, source (db/env/default), and impact description.

## 13) Rollout Modes and Feature Flags

Feature flags per protection stage:

- `kill_switch_enabled`
- `auth_emergency_enabled`
- `turnstile_enforced`
- `rate_limit_raw_enforced`
- `rate_limit_contextual_enforced`
- `dedupe_enforced`
- `daily_limit_enforced`

Semantic rollout modes:

- `observe-only`: evaluate and emit events, no hard blocking (except kill switch).
- `soft-block`: block only high-confidence abuse/risk conditions; borderline cases allowed with telemetry.
- `hard-block`: enforce full configured policy deterministically.

Progressive rollout:

- start observe-only
- promote to soft-block
- finish on hard-block

## 14) Testing Strategy and Acceptance Criteria

### 14.1 Unit tests

- Config precedence and fallback (db > env > default).
- Invalid config values and cross-validation failures.
- Parser typing for enums/units.
- Rate limit calculations.
- Dedupe hash + scope isolation.
- Cooldown and daily usage policy.
- Event idempotency in protection and business streams.

### 14.2 Integration tests

- Full pipeline order enforcement.
- Fail-fast at each stage with no provider invocation.
- Cache hit path does not consume daily quota.
- Concurrent same-hash requests: only one reaches provider.

### 14.3 E2E tests

- `POST /cv-adaptation/analyze`
- `POST /cv-adaptation/analyze-guest`

Assertions:

- protection is applied before heavy processing when possible.
- bot-like repetition blocked.
- plausible human behavior scenarios allowed and not penalized:
- repeated click after visible timeout-sized delay;
- resubmission after meaningful edit in CV/job text (canonical hash changes);
- retry after transient network failure with new requestId.

### 14.4 Smoke tests

- Main feature flag combinations.
- Rollout transition checks (observe-only -> soft-block -> hard-block).

### 14.5 Final validation checklist (must pass)

- No UI or user flow changes.
- AI never called without passing protection pipeline.
- Cache does not consume daily limit.
- Cache respects session/user scope.
- Bot traffic blocked.
- Human-like traffic not blocked incorrectly in validated scenarios.
- Logs/events are correct and correlated.
- Config is secure and audited.

## 15) Operational Retention and Purge

- Define retention by stream and by event type.
- Implement purge/archival jobs with explicit TTL policy.
- Keep derived projections disposable/rebuildable.

## 16) Implementation Impact Map

Primary touched areas:

- `apps/api/src/cv-adaptation/*` (analysis entry points integration)
- `apps/api/src/app.module.ts` (new module wiring)
- `apps/api/src/main.ts` (request/correlation middleware hook if needed)
- `packages/database/prisma/schema.prisma` (new entities)
- `apps/web/src/app/adaptar/page.tsx` and related adapters (token + optional complementary funnel events, no UX change)

Out of scope for this slice:

- UI redesigns
- billing ledger/accounting truth changes
- broad analytics platform migration
