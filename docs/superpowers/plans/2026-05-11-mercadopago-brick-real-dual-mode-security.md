# Mercado Pago Brick Real Dual-Mode Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real Mercado Pago Payment Brick with secure server-side processing, keep Checkout Pro as fallback, and enforce dual-mode via only `PAYMENT_CHECKOUT_MODE`.

**Architecture:** Keep Checkout Pro and Brick as separate branches selected by backend mode decision. Brick submit becomes a real backend payment creation flow with strict payload validation, idempotency, race-safe locking via atomic status transition, and sanitized responses/logs. Webhook/reconcile remain idempotent and compatible with both modes.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Vitest, Mercado Pago SDK

---

### Task 1: Remove redundant Brick flags and centralize mode selection

**Files:**
- Modify: `apps/api/src/plans/plans.service.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/.env.example`
- Test: `apps/api/src/plans/plans.service.spec.ts`

- [ ] **Step 1: Write failing API tests for mode behavior using only PAYMENT_CHECKOUT_MODE**

```ts
test("brick mode decision ignores legacy allowlist/enable flags", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  process.env.PAYMENT_BRICK_ENABLED = "false";
  process.env.PAYMENT_BRICK_ALLOWED_EMAILS = "blocked@example.com";

  const result = await service.createCheckout("user-1", {
    planId: "starter",
    adaptationId: undefined,
  });

  assert.equal(result.checkoutMode, "brick");
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test -- apps/api/src/plans/plans.service.spec.ts`
Expected: FAIL because current implementation still uses legacy flags.

- [ ] **Step 3: Implement mode decision simplification**

```ts
private evaluateBrickCheckoutEligibility(): { useBrick: boolean; reason: string } {
  const mode = (process.env.PAYMENT_CHECKOUT_MODE ?? "pro").trim().toLowerCase();
  if (mode !== "brick") return { useBrick: false, reason: "mode_not_brick" };
  return { useBrick: true, reason: "mode_brick" };
}
```

- [ ] **Step 4: Update env example to only document mode and split credentials**

```env
PAYMENT_CHECKOUT_MODE=pro
MERCADOPAGO_PRO_ACCESS_TOKEN=
MERCADOPAGO_BRICK_ACCESS_TOKEN=
NEXT_PUBLIC_MERCADOPAGO_BRICK_PUBLIC_KEY=
```

- [ ] **Step 5: Re-run tests**

Run: `npm run test -- apps/api/src/plans/plans.service.spec.ts`
Expected: PASS.

---

### Task 2: Add secure Brick payload validation utilities

**Files:**
- Create: `apps/api/src/payments/brick-payload.ts`
- Create: `apps/api/src/payments/brick-payload.spec.ts`

- [ ] **Step 1: Write failing tests for card/pix schema acceptance and rejection**

```ts
test("accepts pix payload without token/installments", () => {
  const parsed = parseBrickPaymentPayload({
    payment_method_id: "pix",
    payer: { email: "user@example.com" },
  });
  assert.equal(parsed.paymentMethodId, "pix");
});

test("rejects boleto method", () => {
  assert.throws(
    () => parseBrickPaymentPayload({ payment_method_id: "bolbradesco" }),
    /brick_payment_method_not_supported/,
  );
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test -- apps/api/src/payments/brick-payload.spec.ts`
Expected: FAIL because parser does not exist.

- [ ] **Step 3: Implement parser with strict whitelist and normalized output**

```ts
export type ParsedBrickPayload =
  | { kind: "pix"; paymentMethodId: "pix"; payerEmail: string; payerIdentification?: { type: string; number: string } }
  | { kind: "card"; paymentMethodId: string; token: string; installments: number; issuerId?: string; payerEmail?: string; payerIdentification?: { type: string; number: string } };

export function parseBrickPaymentPayload(input: unknown): ParsedBrickPayload {
  // validate object shape, allow only known keys, reject boleto/unknown methods,
  // reject amount/status/metadata from client, normalize strings
}
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test -- apps/api/src/payments/brick-payload.spec.ts`
Expected: PASS.

---

### Task 3: Implement log redaction helper for payment flows

**Files:**
- Create: `apps/api/src/payments/payment-redaction.ts`
- Create: `apps/api/src/payments/payment-redaction.spec.ts`
- Modify: `apps/api/src/payments/payments.service.ts`

- [ ] **Step 1: Write failing tests proving sensitive fields are removed**

```ts
test("redacts token and identification.number", () => {
  const redacted = redactPaymentPayload({
    token: "tok_123",
    payer: { identification: { number: "12345678900" } },
  });
  assert.equal(redacted.token, "[REDACTED]");
  assert.equal((redacted.payer as any).identification.number, "[REDACTED]");
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test -- apps/api/src/payments/payment-redaction.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement redaction utility and use it in service logs**

```ts
const SENSITIVE_KEYS = new Set([
  "token",
  "security_code",
  "card_number",
  "number",
  "access_token",
  "authorization",
  "cookie",
]);
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test -- apps/api/src/payments/payment-redaction.spec.ts`
Expected: PASS.

---

### Task 4: Implement Brick real submit with idempotency and race-safe lock

**Files:**
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/payments/payments.service.spec.ts`
- Modify: `apps/api/src/plans/plans.service.ts` (if needed for status mapping reuse)

- [ ] **Step 1: Write failing tests for real submit outcomes and anti-race**

```ts
test("approved response returns concluded redirect", async () => {
  const result = await service.submitBrickPayment("user-1", "purchase-1", validCardPayload);
  assert.equal(result.status, "approved");
  assert.match(result.redirectTo, /\/pagamento\/concluido\?checkoutId=purchase-1$/);
});

test("concurrent submit triggers one MP create call", async () => {
  await Promise.allSettled([
    service.submitBrickPayment("user-1", "purchase-1", validCardPayload),
    service.submitBrickPayment("user-1", "purchase-1", validCardPayload),
  ]);
  assert.equal(paymentCreateSpy.calls.length, 1);
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test -- apps/api/src/payments/payments.service.spec.ts`
Expected: FAIL with stub behavior and race not protected.

- [ ] **Step 3: Implement concrete race-safe lock using atomic status transition**

```ts
const correlationId = randomUUID();
const lock = await this.database.planPurchase.updateMany({
  where: {
    id: purchase.id,
    userId,
    status: "pending",
    mpPaymentId: null,
  },
  data: {
    status: "processing_payment",
    updatedAt: new Date(),
  },
});
if (lock.count !== 1) {
  throw new ConflictException({ errorCode: "brick_payment_in_progress", message: "Pagamento em processamento." });
}
```

- [ ] **Step 4: Generate idempotency key only after lock, persist audit, then call MP**

```ts
const idempotencyKey = `brick:${purchase.id}:${correlationId}`;
await this.database.paymentAuditLog.create({
  data: {
    checkoutId: purchase.id,
    eventType: "brick_payment_create_started",
    actionTaken: "provider_call_pending",
    mpPaymentId: null,
    mpStatus: "processing_payment",
    errorMessage: null,
    requestId: correlationId,
    metadata: { idempotencyKey, checkoutMode: "brick" },
  },
});
```

- [ ] **Step 5: Implement provider call using server-authoritative values only**

```ts
const transactionAmount = purchase.amountInCents / 100;
const response = await paymentClient.create({
  body: {
    transaction_amount: transactionAmount,
    payment_method_id: parsed.paymentMethodId,
    external_reference: purchase.id,
    description,
    metadata,
    ...(parsed.kind === "card" ? { token: parsed.token, installments: parsed.installments } : {}),
    payer,
  },
  requestOptions: { idempotencyKey },
});
```

- [ ] **Step 6: Implement failure-recovery policy for processing_payment state**

```ts
try {
  // provider call + mapping
} catch (error) {
  const mayHaveReachedProvider = isProviderUncertainError(error);

  if (!mayHaveReachedProvider) {
    await this.database.planPurchase.update({
      where: { id: purchase.id },
      data: { status: "pending" },
    });
  }

  if (mayHaveReachedProvider) {
    await this.database.planPurchase.update({
      where: { id: purchase.id },
      data: { status: "pending_payment" },
    });
  }

  throw mapBrickProviderError(error, mayHaveReachedProvider);
}
```

- [ ] **Step 7: Persist status/mpPaymentId and return normalized redirect response**

```ts
if (mpStatus === "approved") {
  await this.plansService.applyApprovedPurchase(purchase.id);
  return { status: "approved", purchaseId: purchase.id, checkoutMode: "brick", redirectTo: `/pagamento/concluido?checkoutId=${purchase.id}` };
}
if (mpStatus === "pending" || mpStatus === "in_process") {
  await this.database.planPurchase.update({ where: { id: purchase.id }, data: { status: "pending_payment" } });
  return { status: "pending", purchaseId: purchase.id, checkoutMode: "brick", redirectTo: `/pagamento/pendente?checkoutId=${purchase.id}` };
}
await this.database.planPurchase.update({ where: { id: purchase.id }, data: { status: "pending" } });
throw new BadRequestException({ errorCode: "brick_payment_rejected", message: "Pagamento recusado. Verifique os dados ou tente outro meio de pagamento." });
```

- [ ] **Step 8: Re-run tests**

Run: `npm run test -- apps/api/src/payments/payments.service.spec.ts`
Expected: PASS.

- [ ] **Step 9: Add explicit test for idempotency key sequencing**

```ts
test("does not generate new idempotency key for concurrent request without lock", async () => {
  // first request obtains lock and creates audit with idempotencyKey
  // second request gets brick_payment_in_progress and creates no provider call/no new key
});
```

---

### Task 5: Add dedicated Brick credentials resolution with fallback compatibility

**Files:**
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/payments/payments.service.spec.ts`

- [ ] **Step 1: Write failing tests for credential selection**

```ts
test("brick submit uses MERCADOPAGO_BRICK_ACCESS_TOKEN when defined", async () => {
  process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN = "brick-token";
  process.env.MERCADOPAGO_ACCESS_TOKEN = "legacy-token";
  await service.submitBrickPayment("user-1", "purchase-1", validPixPayload);
  assert.equal(capturedToken, "brick-token");
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test -- apps/api/src/payments/payments.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement token resolver**

```ts
private getBrickAccessToken(): string | null {
  return (
    process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN?.trim() ||
    process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
    null
  );
}
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test -- apps/api/src/payments/payments.service.spec.ts`
Expected: PASS.

---

### Task 6: Update web API contracts and Brick client submit behavior

**Files:**
- Modify: `apps/web/src/lib/payments-browser-api.ts`
- Modify: `apps/web/src/app/pagamento/checkout/[purchaseId]/page.client.tsx`
- Modify: `apps/web/src/app/pagamento/checkout/[purchaseId]/page.client.test.tsx`

- [ ] **Step 1: Write failing UI tests for redirect behavior by submit status**

```tsx
it("redirects to concluded when backend returns approved", async () => {
  mockSubmitBrickPaymentClient.mockResolvedValue({
    status: "approved",
    purchaseId: "purchase-1",
    checkoutMode: "brick",
    redirectTo: "/pagamento/concluido?checkoutId=purchase-1",
  });
  // assert router navigation called with concluded path
});
```

- [ ] **Step 2: Run failing UI tests**

Run: `npm run test:ui -- "src/app/pagamento/checkout/[purchaseId]/page.client.test.tsx"`
Expected: FAIL because response type is still dryRun.

- [ ] **Step 3: Replace dry-run response type with real status union and error code handling**

```ts
export type BrickPayResponse = {
  purchaseId: string;
  checkoutMode: "brick";
  status: "approved" | "pending";
  redirectTo: string;
};
```

- [ ] **Step 4: Update page submit flow to navigate by redirectTo and remove dry-run branches**

```ts
const response = await submitBrickPaymentClient(data.purchaseId, formData);
router.push(response.redirectTo);
```

- [ ] **Step 5: Re-run UI tests**

Run: `npm run test:ui -- "src/app/pagamento/checkout/[purchaseId]/page.client.test.tsx"`
Expected: PASS.

---

### Task 7: Keep Pro flow unchanged while routing by backend checkout mode

**Files:**
- Modify: `apps/web/src/app/api/plans/checkout/route.ts`
- Modify: `apps/web/src/app/planos/paid-plan-checkout-form.tsx`
- Modify: `apps/web/src/app/planos/page.test.tsx`

- [ ] **Step 1: Write failing tests for dual behavior**

```tsx
it("navigates to brick internal checkout when checkoutMode=brick", async () => {
  // mock /api/plans/checkout returning { checkoutMode:"brick", purchaseId:"p1", checkoutUrl:"/pagamento/checkout/p1" }
  // assert router.push("/pagamento/checkout/p1") and no window.open
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test:ui -- "src/app/planos/page.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement mode branch in paid-plan-checkout-form using backend response**

```ts
if (payload.checkoutMode === "brick") {
  router.push(payload.checkoutUrl);
  return;
}
setCheckoutDraft({ checkoutUrl: payload.checkoutUrl, purchaseId: payload.purchaseId });
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test:ui -- "src/app/planos/page.test.tsx"`
Expected: PASS.

---

### Task 8: Harden Next.js payment proxy errors and payload handling

**Files:**
- Modify: `apps/web/src/app/api/payments/brick/[purchaseId]/pay/route.ts`
- Modify: `apps/web/src/app/api/payments/brick/checkout/[purchaseId]/route.ts`
- Test: `apps/web/src/app/api/payments/brick/[purchaseId]/pay/route.test.ts` (create if absent)

- [ ] **Step 1: Write failing tests for non-JSON and safe passthrough behavior**

```ts
test("returns safe json when upstream returns empty body", async () => {
  // expect { errorCode: "brick_payment_provider_error", message: "Erro ao processar pagamento." }
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test:ui -- "src/app/api/payments/brick/[purchaseId]/pay/route.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement robust proxy normalization without logging raw payload**

```ts
const text = await response.text();
if (!text.trim()) {
  return NextResponse.json({ errorCode: "brick_payment_provider_error", message: "Erro ao processar pagamento." }, { status: response.status || 502 });
}
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test:ui -- "src/app/api/payments/brick/[purchaseId]/pay/route.test.ts"`
Expected: PASS.

---

### Task 9: Add rate limiting protection on Brick pay endpoint

**Files:**
- Modify: `apps/api/src/payments/payments.controller.ts`
- Modify: `apps/api/src/payments/payments.service.ts` (or dedicated guard/interceptor)
- Modify/Create tests under: `apps/api/src/payments/`

- [ ] **Step 1: Write failing tests for rate-limited responses**

```ts
test("brick pay endpoint returns brick_rate_limited after threshold", async () => {
  // simulate repeated calls
  // expect 429 with errorCode brick_rate_limited
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test -- apps/api/src/payments`
Expected: FAIL.

- [ ] **Step 3: Implement rate limit by purchaseId + userId + IP using existing project pattern**

```ts
throw new TooManyRequestsException({
  errorCode: "brick_rate_limited",
  message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
});
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test -- apps/api/src/payments`
Expected: PASS.

---

### Task 10: Validate pending page/status flow for Brick Pix

**Files:**
- Modify (if needed): `apps/web/src/app/pagamento/pendente/page.tsx`
- Modify (if needed): `apps/web/src/lib/payments-browser-api.ts`
- Modify (if needed): `apps/api/src/payments/payments.service.ts`
- Test: `apps/web/src/app/pagamento/pendente/page.test.tsx` (create/update)

- [ ] **Step 1: Write failing tests that Brick pending checkout renders and polls correctly**

```tsx
it("loads pending status for Brick purchase checkoutId", async () => {
  // mock checkout status endpoint response for purchase created by Brick
  // expect pending page to show waiting state and continue polling
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test:ui -- "src/app/pagamento/pendente/page.test.tsx"`
Expected: FAIL if pending page assumes Pro-only query params/flow.

- [ ] **Step 3: Implement status compatibility adjustments if required**

```ts
// ensure checkoutId-only lookup works for Brick
// no hard dependency on preference_id/payment_id query params
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test:ui -- "src/app/pagamento/pendente/page.test.tsx"`
Expected: PASS.

---

### Task 11: Harden webhook/reconcile lookup order for Brick + legacy

**Files:**
- Modify: `apps/api/src/plans/plans.service.ts`
- Modify: `apps/api/src/payments/payments.service.ts` (if reconciliation code shared there)
- Test: `apps/api/src/plans/plans.service.spec.ts`

- [ ] **Step 1: Write failing tests for lookup precedence**

```ts
test("webhook resolves purchase by metadata.purchaseId first", async () => {
  // provider payload includes metadata.purchaseId + external_reference
  // expect resolver to use purchaseId when present
});

test("webhook falls back to external_reference purchase.id, then mpPaymentId, then paymentReference", async () => {
  // verify fallback sequence deterministically
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm run test -- apps/api/src/plans/plans.service.spec.ts`
Expected: FAIL if lookup precedence is incomplete.

- [ ] **Step 3: Implement deterministic lookup chain**

```ts
const whereCandidates = [
  ...(metadataPurchaseId ? [{ id: metadataPurchaseId }] : []),
  ...(externalReference ? [{ id: externalReference }] : []),
  ...(paymentId ? [{ mpPaymentId: paymentId }] : []),
  ...(paymentReference ? [{ paymentReference }] : []),
];
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test -- apps/api/src/plans/plans.service.spec.ts`
Expected: PASS.

---

### Task 12: Verification sweep and docs sync

**Files:**
- Modify: `docs/mercadopago-brick-handoff-2026-05-09.md`
- Modify: `apps/api/.env.example`
- Modify: `apps/web/.env.example` (if exists)

- [ ] **Step 1: Run full targeted suites (API + Web Brick + Pro + pending/webhook regression)**

Run: `npm run test -- apps/api/src/plans/plans.service.spec.ts apps/api/src/payments/payments.service.spec.ts`
Expected: PASS.

Run: `npm run test:ui -- "src/app/pagamento/checkout/[purchaseId]/page.client.test.tsx" "src/app/planos/page.test.tsx" "src/app/pagamento/pendente/page.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Run build checks**

Run: `npm run build --workspace @earlycv/web`
Expected: build success.

- [ ] **Step 3: Update handoff doc to reflect real-flow implementation and removed flags**

```md
- submitBrickPayment now creates real MP payments with idempotency key.
- Legacy dry-run and allowlist flags removed from main flow.
- Pro remains available via PAYMENT_CHECKOUT_MODE=pro.
```

- [ ] **Step 4: Commit in logical slices**

```bash
git add apps/api/src/payments apps/api/src/plans apps/api/.env.example
git commit -m "feat(payments): implement secure brick real submit with idempotency"

git add apps/web/src/app/pagamento apps/web/src/app/planos apps/web/src/lib/payments-browser-api.ts
git commit -m "feat(web): enable brick embedded redirect flow with dual-mode routing"

git add docs/
git commit -m "docs(payments): document brick dual-mode security rollout"
```

---

## Spec Coverage Self-Check

- Dual-mode `pro|brick` only: covered by Task 1 + Task 7.
- Remove redundant flags: Task 1 + Task 10 docs/env sync.
- Real Brick submit: Task 4.
- Card/debit/pix and boleto block: Task 2 + Task 4 tests.
- Backend authoritative amount/ownership: Task 2 + Task 4.
- Concrete atomic lock transition and recovery from processing state: Task 4.
- Idempotency key generated only after lock and audited before provider call: Task 4.
- Secure logging/redaction: Task 3.
- Rate limiting: Task 9.
- Pending page compatibility for Brick Pix/in_process: Task 10.
- Webhook lookup chain (metadata.purchaseId -> external_reference=id -> mpPaymentId -> paymentReference): Task 11.
- Webhook compatibility and idempotency regression: Task 11 + Task 12 test sweep.
- Frontend no popup in Brick, Pro intact: Task 6 + Task 7.

## Concurrency Escalation Rule (mandatory)

- If Task 4 concurrency tests show `updateMany + status transition` is not sufficient under realistic race simulation, STOP implementation and open a schema evolution proposal before proceeding.
- The schema proposal should introduce a dedicated `PaymentAttempt` (or equivalent) with uniqueness guarantees for active attempts per purchase.
- Do not continue shipping real Brick flow without passing anti-race tests under the chosen lock strategy.
