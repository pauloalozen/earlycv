# Payment Recovery Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the manual `Recuperacao pagamentos` feature with eligibility list, admin send controls, secure tokenized recovery link, and login-required checkout resume, without impacting normal payment flow.

**Architecture:** Add a dedicated `payment-recovery` module in API, new Prisma models for send/token/ignore state, and a dedicated admin page in web. Implement in two phases: Phase A (admin ops + dry-run/allowlist send) and Phase B (public token click + secure resume bridge). Keep checkout behavior delegated to existing `plans.resumeCheckout` paths.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Node test runner, PostHog integration, existing email delivery port.

---

### Task 1: Add schema and env surface (TDD)

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_payment_recovery/migration.sql`
- Modify: `packages/database/src/schema.spec.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing schema assertions**

```ts
test("Payment recovery models and enums exist", () => {
  const enums = schemaText;
  assert.match(enums, /enum PaymentRecoveryEligibilityStatus \{/);
  assert.match(enums, /eligible/);
  assert.match(enums, /possibly_resolved/);
  assert.match(enums, /not_eligible/);

  assert.match(enums, /enum PaymentRecoveryEmailStatus \{/);
  assert.match(enums, /sent/);
  assert.match(enums, /failed/);
  assert.match(enums, /skipped/);

  const email = getBlock("model", "PaymentRecoveryEmail");
  assert.match(email, /purchaseId\s+String/);
  assert.match(email, /sentByAdminUserId\s+String/);
  assert.match(email, /clickedAt\s+DateTime\?/);

  const token = getBlock("model", "PaymentRecoveryToken");
  assert.match(token, /tokenHash\s+String\s+@unique/);
  assert.match(token, /expiresAt\s+DateTime/);

  const ignore = getBlock("model", "PaymentRecoveryIgnore");
  assert.match(ignore, /purchaseId\s+String\s+@unique/);
  assert.match(ignore, /ignoredByAdminId\s+String/);
});
```

- [ ] **Step 2: Run schema test to verify fail**

Run: `npm run test --workspace @earlycv/database -- src/schema.spec.ts`
Expected: FAIL with missing enums/models.

- [ ] **Step 3: Add Prisma enums and models**

Add to `schema.prisma`:

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

And add the 3 models exactly as spec.

- [ ] **Step 4: Create migration SQL**

Create migration SQL for new enums/tables/indexes.

- [ ] **Step 5: Add env flags to `.env.example`**

```env
ADMIN_PAYMENT_RECOVERY_ENABLED=false
PAYMENT_RECOVERY_EMAIL_ENABLED=false
PAYMENT_RECOVERY_EMAIL_DRY_RUN=true
PAYMENT_RECOVERY_EMAIL_ALLOWLIST=
PAYMENT_RECOVERY_TOKEN_TTL_DAYS=7
PAYMENT_RECOVERY_PUBLIC_RATE_LIMIT_PER_MINUTE=30
PAYMENT_RECOVERY_TOKEN_SINGLE_USE=true
```

- [ ] **Step 6: Regenerate client and verify tests**

Run: `npm run generate --workspace @earlycv/database && npm run test --workspace @earlycv/database -- src/schema.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations .env.example packages/database/src/schema.spec.ts
git commit -m "feat(database): add payment recovery persistence models"
```

### Task 2: Build payment-recovery module skeleton + config guards

**Files:**
- Create: `apps/api/src/payment-recovery/payment-recovery.module.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery.config.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery.types.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing module wiring test**

Create/extend module test to assert controller route prefix and provider resolution.

```ts
test("payment-recovery module resolves", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [PaymentRecoveryModule],
  }).compile();
  assert.ok(moduleRef.get(PaymentRecoveryConfigService));
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery.module.spec.ts`
Expected: FAIL missing module.

- [ ] **Step 3: Implement config service fail-closed behavior**

```ts
export class PaymentRecoveryConfigService {
  isAdminEnabled(): boolean {
    return toBool(process.env.ADMIN_PAYMENT_RECOVERY_ENABLED, false);
  }
  isEmailEnabled(): boolean {
    return toBool(process.env.PAYMENT_RECOVERY_EMAIL_ENABLED, false);
  }
  isDryRun(): boolean {
    return toBool(process.env.PAYMENT_RECOVERY_EMAIL_DRY_RUN, true);
  }
  tokenTtlDays(): number {
    return clampInt(process.env.PAYMENT_RECOVERY_TOKEN_TTL_DAYS, 7, 1, 30);
  }
}
```

- [ ] **Step 4: Register module in app**

Import into `AppModule` only once and keep boundaries explicit.

- [ ] **Step 5: Run targeted tests**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery.module.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/payment-recovery
git commit -m "feat(api): scaffold payment recovery module and config"
```

### Task 3: Implement eligibility service + grouping logic (TDD)

**Files:**
- Create: `apps/api/src/payment-recovery/payment-recovery-eligibility.service.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-eligibility.service.spec.ts`

- [ ] **Step 1: Write failing eligibility tests**

Include explicit scenarios:

```ts
test("does not return completed purchase as eligible", async () => {});
test("unlock_cv unlocked adaptation is not_eligible", async () => {});
test("unlock_cv pending not unlocked is eligible", async () => {});
test("available credits marks possibly_resolved", async () => {});
test("buy_credits with later completed purchase is possibly_resolved", async () => {});
test("groups by user+adaptation and exposes relatedPendingPurchaseCount", async () => {});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-eligibility.service.spec.ts`
Expected: FAIL missing service.

- [ ] **Step 3: Implement minimal classifier + grouper**

Core API:

```ts
async listPending(input: ListPendingInput): Promise<ListPendingOutput>;
private classifyUnlockCv(...): EligibilityResult;
private classifyBuyCredits(...): EligibilityResult;
private groupCandidates(...): GroupedCandidate[];
```

- [ ] **Step 4: Add defensive null-safe score extraction helper**

```ts
function readScoreFields(adaptedContentJson: unknown): {
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreDelta: number | null;
  improvementPercent: number | null;
}
```

- [ ] **Step 5: Run targeted tests**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-eligibility.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payment-recovery/payment-recovery-eligibility.service.ts apps/api/src/payment-recovery/payment-recovery-eligibility.service.spec.ts
git commit -m "feat(api): implement payment recovery eligibility engine"
```

### Task 4: Add admin list and ignore endpoints

**Files:**
- Create: `apps/api/src/payment-recovery/payment-recovery-admin.controller.ts`
- Create: `apps/api/src/payment-recovery/dto/list-payment-recovery.dto.ts`
- Create: `apps/api/src/payment-recovery/dto/ignore-payment-recovery.dto.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-ignore.service.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-admin.controller.spec.ts`

- [ ] **Step 1: Write failing controller tests**

```ts
test("GET /admin/payment-recovery/pending returns paginated payload", async () => {});
test("POST ignore stores ignore state", async () => {});
test("DELETE ignore removes ignore state", async () => {});
test("feature disabled returns not found", async () => {});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-admin.controller.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement endpoints with role guard**

Routes:

```ts
@Get("admin/payment-recovery/pending")
@Post("admin/payment-recovery/:purchaseId/ignore")
@Delete("admin/payment-recovery/:purchaseId/ignore")
```

- [ ] **Step 4: Wire DTO validation defaults**

Default `eligibilityStatus` to `eligible,possibly_resolved`.

- [ ] **Step 5: Run targeted tests**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-admin.controller.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payment-recovery/payment-recovery-admin.controller.ts apps/api/src/payment-recovery/dto apps/api/src/payment-recovery/payment-recovery-ignore.service.ts apps/api/src/payment-recovery/payment-recovery-admin.controller.spec.ts
git commit -m "feat(api): expose admin payment recovery list and ignore actions"
```

### Task 5: Implement email send service with dry-run/allowlist/idempotency hardening

**Files:**
- Create: `apps/api/src/payment-recovery/payment-recovery-email.service.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-email-copy.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-email.service.spec.ts`
- Modify: `apps/api/src/payment-recovery/payment-recovery-admin.controller.ts`

- [ ] **Step 1: Write failing send tests**

```ts
test("does not send when PAYMENT_RECOVERY_EMAIL_ENABLED=false", async () => {});
test("dry-run records skipped when allowlist mismatch", async () => {});
test("dry-run + allowlist can send real", async () => {});
test("blocks duplicate send inside cooldown window", async () => {});
test("records failed status on provider exception", async () => {});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-email.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement personalized copy builder**

```ts
export function buildRecoveryImprovementText(input: ImprovementInput): string
```

Fallback order: before/after -> percent -> delta -> generic.

- [ ] **Step 4: Implement transactional send pipeline**

Use transaction to:
1) re-evaluate eligibility,
2) assert idempotency key (`purchaseId + step + cooldown`),
3) create token,
4) persist `PaymentRecoveryEmail` record.

- [ ] **Step 5: Implement PII-safe structured logs**

Do not log raw token or full email.

- [ ] **Step 6: Emit PostHog events**

`payment_recovery_email_sent`, `payment_recovery_email_failed`.

- [ ] **Step 7: Run targeted tests**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-email.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/payment-recovery/payment-recovery-email.service.ts apps/api/src/payment-recovery/payment-recovery-email-copy.ts apps/api/src/payment-recovery/payment-recovery-email.service.spec.ts apps/api/src/payment-recovery/payment-recovery-admin.controller.ts
git commit -m "feat(api): add manual recovery email send with dry-run and allowlist"
```

### Task 6: Implement public token endpoint + login-required resume bridge (Phase B)

**Files:**
- Create: `apps/api/src/payment-recovery/payment-recovery-public.controller.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-token.service.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-resume.service.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-public.controller.spec.ts`
- Modify: `apps/api/src/plans/plans.controller.ts` (only if a protected bridge endpoint is needed)

- [ ] **Step 1: Write failing token flow tests**

```ts
test("invalid token returns friendly response", async () => {});
test("expired token returns friendly response", async () => {});
test("click registers clickedAt and event", async () => {});
test("click does not unlock cv", async () => {});
test("resume requires auth and ownership", async () => {});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-public.controller.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement token validation hardening**

Include:
- strict token format check,
- hash lookup,
- expiry check,
- replay-safe response,
- optional single-use consume.

- [ ] **Step 4: Implement public click endpoint**

```ts
@Get("payment-recovery/:token")
```

Behavior:
- if completed/unlocked -> dashboard redirect,
- else -> login redirect with safe return key.

- [ ] **Step 5: Implement resume bridge with redirect allowlist**

Protected endpoint validates auth + ownership and delegates to `plansService.resumeCheckout`.

- [ ] **Step 6: Add structured audit events/counters**

`token_validated`, `token_expired`, `token_invalid`, `resume_denied_ownership`, `resume_success`.

- [ ] **Step 7: Run targeted tests**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-public.controller.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/payment-recovery/payment-recovery-public.controller.ts apps/api/src/payment-recovery/payment-recovery-token.service.ts apps/api/src/payment-recovery/payment-recovery-resume.service.ts apps/api/src/payment-recovery/payment-recovery-public.controller.spec.ts apps/api/src/plans/plans.controller.ts
git commit -m "feat(api): add secure payment recovery token click and resume bridge"
```

### Task 7: Add public rate-limiting and anti-abuse protections

**Files:**
- Create: `apps/api/src/payment-recovery/payment-recovery-rate-limit.service.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-rate-limit.guard.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery-rate-limit.guard.spec.ts`
- Modify: `apps/api/src/payment-recovery/payment-recovery-public.controller.ts`

- [ ] **Step 1: Write failing guard tests**

```ts
test("allows requests below threshold", async () => {});
test("blocks requests above threshold", async () => {});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-rate-limit.guard.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement IP + user-agent fingerprint limiter**

Use in-memory limiter for MVP with clear interface for future Redis swap.

- [ ] **Step 4: Apply guard to public endpoint**

Guard only the recovery click route.

- [ ] **Step 5: Run tests**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-rate-limit.guard.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payment-recovery/payment-recovery-rate-limit.service.ts apps/api/src/payment-recovery/payment-recovery-rate-limit.guard.ts apps/api/src/payment-recovery/payment-recovery-rate-limit.guard.spec.ts apps/api/src/payment-recovery/payment-recovery-public.controller.ts
git commit -m "feat(api): add public payment recovery rate limiting"
```

### Task 8: Build web admin API client and route

**Files:**
- Create: `apps/web/src/lib/admin-payment-recovery-api.ts`
- Create: `apps/web/src/app/admin/recuperacao-pagamentos/page.tsx`
- Modify: `apps/web/src/lib/admin-users-operations.ts`

- [ ] **Step 1: Write failing web client tests**

```ts
test("listAdminPaymentRecovery serializes filters", async () => {});
test("sendAdminPaymentRecoveryEmail posts purchase endpoint", async () => {});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test --workspace @earlycv/web -- src/lib/admin-payment-recovery-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement server-only admin client**

Functions:
- `listAdminPaymentRecovery`
- `sendAdminPaymentRecoveryEmail`
- `ignoreAdminPaymentRecovery`
- `unignoreAdminPaymentRecovery`

- [ ] **Step 4: Add menu item**

In `adminNavItems` add:

```ts
{ href: "/admin/recuperacao-pagamentos", label: "Recuperacao pagamentos" }
```

- [ ] **Step 5: Implement page with filters and summary cards**

Default query state includes `eligibilityStatus=eligible,possibly_resolved`.

- [ ] **Step 6: Run targeted tests**

Run: `npm run test --workspace @earlycv/web -- src/lib/admin-payment-recovery-api.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/admin-payment-recovery-api.ts apps/web/src/app/admin/recuperacao-pagamentos/page.tsx apps/web/src/lib/admin-users-operations.ts
git commit -m "feat(web): add admin recovery payments page and api client"
```

### Task 9: Add row actions, confirmation modal, and UX constraints

**Files:**
- Create: `apps/web/src/app/admin/recuperacao-pagamentos/_components/send-recovery-email-button.tsx`
- Create: `apps/web/src/app/admin/recuperacao-pagamentos/_components/send-recovery-email-modal.tsx`
- Create: `apps/web/src/app/admin/recuperacao-pagamentos/_components/recovery-status-badge.tsx`
- Create: `apps/web/src/app/admin/recuperacao-pagamentos/page.test.tsx`

- [ ] **Step 1: Write failing UI tests**

```tsx
test("renders eligible and possibly_resolved rows", async () => {});
test("send button disabled for not_eligible", async () => {});
test("modal preview includes job title and improvement text", async () => {});
test("send success and failure toasts are shown", async () => {});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test --workspace @earlycv/web -- src/app/admin/recuperacao-pagamentos/page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement modal flow and actions**

Button opens modal -> confirm -> server action call -> revalidate and toast.

- [ ] **Step 4: Highlight possibly_resolved rows**

Use warning tone badge and subtle row background.

- [ ] **Step 5: Add copy-link action (non-sensitive tokenless copy)**

Copy endpoint action reference only; do not expose raw token in UI list.

- [ ] **Step 6: Run tests**

Run: `npm run test --workspace @earlycv/web -- src/app/admin/recuperacao-pagamentos/page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/recuperacao-pagamentos
git commit -m "feat(web): add manual recovery email modal and row actions"
```

### Task 10: Integrate PostHog event emission and observability hooks

**Files:**
- Modify: `apps/api/src/payment-recovery/*.ts`
- Modify: `apps/api/src/posthog-integration/posthog-event-exporter.service.ts` (if new event mapping is required)
- Create: `apps/api/src/payment-recovery/payment-recovery-observability.spec.ts`

- [ ] **Step 1: Write failing observability tests**

```ts
test("emits payment_recovery_admin_viewed", async () => {});
test("emits payment_recovery_email_sent/failed", async () => {});
test("emits payment_recovery_email_clicked and checkout_resumed", async () => {});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-observability.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement event payload builder**

Centralize common properties to avoid drift.

- [ ] **Step 4: Wire all event emission points**

Admin view, send attempt, click, resume, approved/unlocked follow-on handlers.

- [ ] **Step 5: Run tests**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery-observability.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payment-recovery apps/api/src/posthog-integration/posthog-event-exporter.service.ts
git commit -m "feat(api): add payment recovery analytics instrumentation"
```

### Task 11: End-to-end regression checks for payment safety

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`
- Create: `apps/api/src/payment-recovery/payment-recovery.e2e-spec.ts`

- [ ] **Step 1: Write failing e2e tests**

```ts
test("recovery click never unlocks without approved payment", async () => {});
test("approved purchase flow remains unchanged", async () => {});
test("resume bridge uses ownership guard", async () => {});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery.e2e-spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimum fixes to satisfy tests**

Adjust services/controllers only where needed.

- [ ] **Step 4: Run e2e suite**

Run: `npm run test --workspace @earlycv/api -- src/payment-recovery/payment-recovery.e2e-spec.ts src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payment-recovery/payment-recovery.e2e-spec.ts apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts
git commit -m "test(api): add payment recovery e2e safety coverage"
```

### Task 12: Full verification and final docs touch

**Files:**
- Modify: `docs/runbook/analysis-protection-operational-runbook.md` (only if event ops notes need extension)
- Create: `docs/runbook/payment-recovery-operational-runbook.md`

- [ ] **Step 1: Add operational runbook for recovery flags and safe rollout**

Include:
- rollout sequence,
- dry-run checklist,
- allowlist checklist,
- rollback procedure,
- incident playbook for invalid-token spike.

- [ ] **Step 2: Run impacted checks**

Run: `npm run check --workspace @earlycv/api && npm run check --workspace @earlycv/web`
Expected: PASS.

- [ ] **Step 3: Run required project verification**

Run: `npm run check && npm run generate --workspace @earlycv/database && npm run build && npm run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/runbook/payment-recovery-operational-runbook.md docs/runbook/analysis-protection-operational-runbook.md
git commit -m "docs(runbook): add payment recovery rollout and incident guide"
```

## Spec Coverage Check

- Admin section, list, filters, grouping, row actions: Tasks 4, 8, 9.
- Eligibility rules per originAction: Task 3.
- Manual send with personalization and controls: Task 5.
- Secure tokenized link and public endpoint: Task 6.
- Hardening requirements (rate limit, replay, redirect allowlist, structured logs, idempotency, transactions, fail-closed): Tasks 5, 6, 7.
- PostHog events and properties: Task 10.
- No checkout regression / no auto-unlock changes: Task 11.
- Rollout + operations docs: Task 12.
