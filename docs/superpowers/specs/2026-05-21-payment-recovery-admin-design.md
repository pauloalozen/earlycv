# Payment Recovery Admin Design (Manual MVP)

## Context

EarlyCV needs an admin-only recovery flow for users who started checkout but did not complete payment. The objective is to manually re-engage these users with a safe recovery link that resumes checkout, without changing normal payment behavior and without auto-scheduler in this MVP.

This feature must be conservative, incremental, and production-safe because there is no staging environment.

## Scope and Non-Goals

### In scope

- New admin section: `Recuperacao pagamentos`.
- Pending purchase recovery list with eligibility classification.
- Manual send action for recovery email.
- Secure expirable tokenized link.
- Public token endpoint that does not unlock CV by itself.
- Login-required resume behavior after click.
- Event tracking and send history.
- Feature flags for safe rollout.

### Out of scope

- Automatic scheduler for recovery campaigns.
- Refactor of checkout architecture.
- Landing page or pricing changes.
- Changes to normal webhook/polling/auto-unlock behavior.

## Confirmed Product Decisions

- Delivery strategy: 2 phases.
- Phase A send behavior: dry-run with allowlist real send.
- Admin label: `Recuperacao pagamentos`.
- For `buy_credits`, approved-after-pending signal: same user + later `createdAt` + `completed`.
- Ignore action must be persisted now.
- Recovery click requires login before checkout resume.
- Token TTL default 7 days with env override.
- Default list shows `eligible` + `possibly_resolved`; filter can switch to all states.

## Architecture Choice

Chosen approach: dedicated API module `payment-recovery` plus dedicated admin page.

Rationale:

- Isolates risky logic from current `payments`/`plans` critical path.
- Enables phased delivery without destabilizing normal checkout.
- Keeps maintainable boundaries for eligibility, emailing, and token lifecycle.

## Domain Additions

### New enums

```prisma
enum PaymentRecoveryEligibilityStatus {
  eligible
  possibly_resolved
  not_eligible
}

enum PaymentRecoveryEmailStatus {
  sent
  failed
  skipped
}
```

### New model: `PaymentRecoveryEmail`

```prisma
model PaymentRecoveryEmail {
  id                String                   @id @default(cuid())
  purchaseId        String
  userId            String
  adaptationId      String?
  step              String                   @default("manual_admin")
  status            PaymentRecoveryEmailStatus
  sentByAdminUserId String
  sentAt            DateTime?
  providerMessageId String?
  errorMessage      String?
  clickedAt         DateTime?
  metadataJson      Json?
  createdAt         DateTime                 @default(now())
  updatedAt         DateTime                 @updatedAt

  @@index([purchaseId, createdAt])
  @@index([userId, createdAt])
  @@index([adaptationId])
}
```

### New model: `PaymentRecoveryToken`

```prisma
model PaymentRecoveryToken {
  id           String   @id @default(cuid())
  purchaseId   String
  userId       String
  adaptationId String?
  tokenHash    String   @unique
  expiresAt    DateTime
  usedAt       DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([purchaseId, createdAt])
  @@index([userId, createdAt])
  @@index([expiresAt])
}
```

### New model: `PaymentRecoveryIgnore`

```prisma
model PaymentRecoveryIgnore {
  id                String   @id @default(cuid())
  purchaseId        String   @unique
  userId            String
  adaptationId      String?
  reason            String?
  ignoredByAdminId  String
  ignoredAt         DateTime @default(now())
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([userId])
  @@index([adaptationId])
  @@index([ignoredAt])
}
```

Notes:

- MVP keeps loose relation fields (string IDs) to avoid cascades on critical models.
- `tokenHash` stores only hash, never raw token.

## Feature Flags

New env variables:

- `ADMIN_PAYMENT_RECOVERY_ENABLED=false`
- `PAYMENT_RECOVERY_EMAIL_ENABLED=false`
- `PAYMENT_RECOVERY_EMAIL_DRY_RUN=true`
- `PAYMENT_RECOVERY_EMAIL_ALLOWLIST=`
- `PAYMENT_RECOVERY_TOKEN_TTL_DAYS=7`

Behavior:

- If admin feature disabled, section hidden in web and admin endpoints return 404/forbidden.
- If email disabled, send endpoint returns controlled `skipped` (or UI disabled).
- Dry-run true: no real send except allowlist targets.
- Allowlist present: only listed addresses can receive real email.

## Eligibility Engine

Service: `PaymentRecoveryEligibilityService`.

Input sources:

- `PlanPurchase`, `User`, `CvAdaptation`, `CvUnlock`, `PaymentRecoveryEmail`, `PaymentRecoveryIgnore`.

Core states:

- `eligible`
- `possibly_resolved`
- `not_eligible`

### Baseline rules

Purchase candidate must be pending-like (`none`, `pending`, `processing_payment`, `pending_payment`) and have user with valid email.

Mark `not_eligible` when:

- purchase status terminal (`completed`, `failed`, `refunded`),
- user missing/deleted,
- user email missing,
- unsupported `originAction`,
- explicit ignore rule (for default list behavior).

### `unlock_cv` rules

- If `originAdaptationId` missing: `not_eligible` (`missing_adaptation`).
- If adaptation already unlocked: `not_eligible` (`adaptation_already_unlocked`).
- If approved purchase exists later for same user and same adaptation context: `possibly_resolved`.
- If user has available credits: `possibly_resolved` (`user_has_available_credits`) but not auto-excluded as ineligible.
- If still pending and adaptation not unlocked: `eligible` (`pending_unlock_cv_not_unlocked`).

### `buy_credits` rules

- Later approved purchase for same user: `possibly_resolved` (`approved_purchase_after_pending`).
- If no later approved purchase and user has zero credits: `eligible`.
- If credits available now with no later proof: `possibly_resolved`.

### Grouping and relevance

- Primary grouping key: `userId + originAdaptationId` when adaptation exists.
- Fallback grouping for credit purchases: `userId + originAction`.
- Display most recent pending purchase as representative.
- Return `relatedPendingPurchaseCount` for grouped context.

## API Contracts

### Phase A - Admin list

`GET /admin/payment-recovery/pending`

Filters:

- `eligibilityStatus` = `eligible|possibly_resolved|not_eligible|all`
- `originAction` = `unlock_cv|buy_credits|all`
- `from`, `to`
- `hasRecoveryEmail` = `true|false`
- `hasAvailableCredits` = `true|false`
- `planType`
- `minAmount`, `maxAmount`
- `query` (name/email)
- pagination `page`, `limit`

Default behavior:

- include `eligible` + `possibly_resolved`
- exclude ignored rows unless explicit filter requests ignored

Response shape:

```json
{
  "items": [
    {
      "userId": "",
      "userName": "",
      "userEmail": "",
      "purchaseId": "",
      "purchaseStatus": "pending",
      "originAction": "unlock_cv",
      "originAdaptationId": "",
      "planName": "",
      "amount": 29.9,
      "createdAt": "",
      "lastUpdatedAt": "",
      "jobTitle": "",
      "companyName": "",
      "scoreBefore": 44,
      "scoreAfter": 80,
      "scoreDelta": 36,
      "improvementPercent": 81.8,
      "currentUserCredits": 0,
      "hasAvailableCredits": false,
      "hasApprovedPurchaseAfterPending": false,
      "isAdaptationUnlocked": false,
      "eligibilityStatus": "eligible",
      "eligibilityReason": "pending_unlock_cv_not_unlocked",
      "relatedPendingPurchaseCount": 2,
      "lastRecoveryEmailSentAt": "",
      "recoveryEmailCount": 1,
      "isIgnored": false
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 0 },
  "filters": {}
}
```

### Phase A - Send manual email

`POST /admin/payment-recovery/:purchaseId/send-email`

Behavior:

- Re-evaluate eligibility on demand.
- If `not_eligible`, return 409 with reason.
- Build personalized copy from available adaptation/job/score context.
- Create token record (for Phase B link).
- Respect enabled/dry-run/allowlist flags.
- Persist `PaymentRecoveryEmail` with `sent|failed|skipped`.
- Idempotency guard: avoid duplicate send in a short cooldown (example: 10 min per purchase).

Response:

```json
{
  "status": "sent",
  "purchaseId": "...",
  "emailRecordId": "...",
  "dryRun": true,
  "allowlistMatched": false
}
```

### Phase A - Ignore controls

- `POST /admin/payment-recovery/:purchaseId/ignore`
- `DELETE /admin/payment-recovery/:purchaseId/ignore`

### Phase B - Public recovery click

`GET /payment-recovery/:token`

Flow:

1. Validate token hash and expiration.
2. Register click (`clickedAt`) and event.
3. Resolve purchase + adaptation context.
4. If already completed/unlocked, redirect to dashboard/adaptation destination.
5. If still recoverable, redirect to login with signed next-step.
6. After login, protected resume endpoint checks ownership and calls existing `resumeCheckout` flow.
7. Redirect to Mercado Pago checkout URL.
8. Invalid/expired token renders friendly page.

Security guarantees:

- No CV unlock from link click.
- No trust in raw purchase IDs from URL.
- Ownership checked after login before resume.

## Email Strategy

Subject baseline:

- `Seu CV adaptado para a vaga esta pronto para liberar`

Preheader baseline:

- `Voce iniciou a liberacao, mas o pagamento nao foi concluido.`

Improvement text fallback order:

1. `scoreBefore` + `scoreAfter`
2. `improvementPercent`
3. `scoreDelta`
4. generic message: `melhor alinhamento com os requisitos da vaga`

Copy constraints:

- No hiring guarantee promises.
- No fabricated metrics.
- No sensitive internal details.

## Analytics / PostHog

Events:

- `payment_recovery_admin_viewed`
- `payment_recovery_email_sent`
- `payment_recovery_email_failed`
- `payment_recovery_email_clicked`
- `payment_recovery_checkout_resumed`
- `payment_recovery_payment_approved`
- `payment_recovery_cv_unlocked`
- `payment_recovery_marked_ignored`

Properties (when available):

- `purchaseId`, `userId`, `adaptationId`
- `planName`, `amount`, `originAction`, `paymentStatus`
- `eligibilityStatus`, `hasAvailableCredits`, `hasApprovedPurchaseAfterPending`
- `isAdaptationUnlocked`, `jobTitle`, `companyName`
- `scoreBefore`, `scoreAfter`, `scoreDelta`, `improvementPercent`
- `sentByAdminUserId`
- `leadCode`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`

## Admin UI Design

Route: `/admin/recuperacao-pagamentos`

Header:

- Title: `Recuperacao pagamentos`
- Subtitle: `Usuarios que iniciaram pagamento e ainda nao concluiram.`

Top cards:

- Elegiveis
- Possivelmente resolvidos
- E-mails enviados
- Recuperados apos e-mail

Table columns include requested business context, including purchase/adaptation/job/score/credits and recovery history.

Row actions:

- Enviar e-mail
- Ver detalhes
- Ver usuario
- Ver adaptacao
- Copiar link
- Marcar ignorado / remover ignorado

Send modal:

- Shows user, email, vacancy context, improvement snippet, and recovery action preview.
- Confirm sends and shows toast success/failure.

Visual state:

- `possibly_resolved` highlighted with warning tone.

## Phase Plan

### Phase A (admin operations)

1. Prisma migrations for email/token/ignore tables.
2. API admin list with eligibility and filters.
3. API manual send with dry-run + allowlist.
4. API ignore/unignore.
5. Admin page + filters + modal + actions.
6. PostHog events for admin viewed/sent/failed/ignored.

### Phase B (public secure resume)

1. Token validation click endpoint.
2. Login-required resume bridge.
3. Redirect to existing resume checkout flow.
4. Friendly invalid/expired page.
5. Remaining events: clicked/resumed/approved/unlocked.

## Testing Strategy

### Backend

- Eligibility classification scenarios for both `unlock_cv` and `buy_credits`.
- Exclude approved purchases from eligible list.
- Adaptation unlocked must never be eligible.
- Credits-only signal maps to `possibly_resolved`, not hard exclusion for unlock case.
- Dry-run behavior, allowlist behavior, disabled feature behavior.
- Duplicate send guard.
- Token generation entropy + hash storage + TTL enforcement.
- Expired token path blocked.
- Click does not unlock CV.

### Frontend

- Page render and default filters (`eligible + possibly_resolved`).
- Filter interactions.
- Send button eligibility/flag behavior.
- Modal preview content.
- Success/failure/disabled states.
- Warning style for `possibly_resolved` rows.

## Risks and Mitigations

- Risk: false positives in eligibility.
  - Mitigation: conservative `possibly_resolved` state and explicit filtering.
- Risk: accidental real sends in production.
  - Mitigation: default dry-run true + allowlist gate + event audit.
- Risk: token abuse.
  - Mitigation: hashed token, expiry, login requirement, ownership checks.
- Risk: regression in payment flow.
  - Mitigation: dedicated module, no mutation of existing webhook/auto-unlock logic.

## Acceptance Criteria Mapping

This design satisfies the acceptance list by:

- exposing admin section and actionable list,
- excluding already paid/unlocked records from eligible,
- enabling manual send with secure link,
- resuming checkout safely without direct unlock,
- recording events and send history,
- guarding rollout with flags,
- preserving normal payment path unchanged.

## Additional hardening requirements

The implementation must include the following hardening measures in both phases.

- Rate limit on public recovery endpoint (`GET /payment-recovery/:token`) by IP and user-agent fingerprint.
- Strict token format validation before any DB lookup to reduce abuse surface.
- Constant-time token hash comparison semantics at validation boundaries.
- Single-use enforcement option: when configured, token is marked as consumed on successful resume bridge.
- Replay-aware behavior: repeated click attempts after consumption/expiry must return the same friendly safe response.
- Redirect allowlist enforcement to prevent open redirect risks in login/next-step handoff.
- Structured audit logs for all sensitive transitions (`token_validated`, `token_expired`, `token_invalid`, `resume_denied_ownership`, `resume_success`).
- PII-safe logging only (no raw token, no full email, no full payload dumps).
- Admin send endpoint idempotency strengthened with deterministic key (`purchaseId + step + cooldownWindow`) to prevent burst duplicates.
- Concurrency-safe writes for send history and token issuance using transaction boundaries.
- Feature-flag fail-closed defaults in production (if parsing fails, disable send/resume behavior).
- Explicit dead-letter/error capture path for email provider failures with retryability metadata.
- Monitoring counters/alerts for abnormal spikes in invalid token hits and send failures.
- Defensive null-safe parsing for adaptation score metadata used in copy personalization.
- Backward compatibility guard: if no recoverable checkout path exists, return friendly fallback without throwing technical errors.

If there is implementation uncertainty on any hardening item, stop and clarify before coding that specific part.

Additional hardening requirements:

1. Admin authorization:
   All /admin/payment-recovery endpoints must require authenticated admin role. User-level authentication is not enough. All sensitive actions must record adminUserId.

2. Recovery token linkage:
   PaymentRecoveryToken must be linked to PaymentRecoveryEmail when created from an email send. Add emailRecordId or equivalent. Click tracking should be associated with the token and, when possible, reflected on the email record.

3. Token click semantics:
   Token click must not consume or invalidate the token immediately. The user may click multiple times within TTL, especially because login is required. Track firstClickedAt/lastClickedAt or clickedAt, but do not block legitimate repeated clicks during TTL.

4. Public endpoint safety:
   GET /payment-recovery/:token must use generic error responses for invalid, expired, or unavailable tokens. Do not reveal whether a token exists. Apply IP-based rate limiting.

5. Copy link action:
   The Admin "Copiar link" action must either be removed from MVP or generate a fully audited token with createdByAdminUserId and purpose="manual_copy". It must not expose raw purchaseId.

6. Email/token audit:
   Persist enough metadata to reconstruct what was sent: subject, preheader, main copy variables, jobTitle used, score values used, dryRun, allowlistMatched, and realEmailSent.

7. Send limits:
   In addition to short cooldown, enforce a maximum number of recovery emails per purchase/adaptation. MVP default: 1 real send per purchase unless explicitly overridden later.

8. Pending status safety:
   Status "none" should only be considered recoverable if there is concrete checkout evidence, such as Mercado Pago preference ID, checkout URL, external reference, or checkout_started event. Otherwise classify as not_eligible with reason missing_checkout_context.

9. Expired status distinction:
   Separate expired_recoverable from expired_unrecoverable. Expired recoverable purchases may recreate checkout preference. Expired unrecoverable purchases must be not_eligible.

10. Unlock_cv resolution:
    For unlock_cv, do not consider any later completed purchase by the same user as enough proof. Prefer these signals:

- same originAdaptationId;
- existing CvUnlock for adaptation;
- debit/unlock audit tied to adaptation.
  Only then mark as resolved/possibly_resolved.

11. Buy_credits resolution:
    For buy_credits, prefer paymentApprovedAt/completedAt when available to determine approved-after-pending. If unavailable, use createdAt as fallback.

12. Score copy safety:
    Email should prefer "de X% para Y% de aderência" or "+N pontos de aderência". Avoid using improvementPercent as "X% mais adaptado" unless the metric is explicitly validated and product-approved.

13. Sensitive email content:
    Avoid including companyName in the email body by default. Use jobTitle when available. Do not expose unnecessary details in subject/preheader.

14. Opt-out:
    If recovery opt-out does not exist yet, either implement minimal opt-out for payment recovery reminders or explicitly mark this as a known compliance/reputation risk. Do not send to users who requested account deletion or communication opt-out.

15. Event idempotency:
    payment_recovery_payment_approved and payment_recovery_cv_unlocked must be emitted once per purchase/adaptation recovery context. Avoid duplicate events from webhook + polling + resume flow.
