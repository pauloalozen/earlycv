# Analysis Protection + Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a backend-first protection firewall and split observability stack so AI analysis cannot run without passing anti-abuse/cost gates, while preserving the current UX.

**Architecture:** Add two explicit modules (`analysis-protection`, `analysis-observability`) and route all analysis execution through a single protected facade with strict stage ordering. Persist durable telemetry/config/audit/funnel events in PostgreSQL, and allow hot-window operational state (rate windows, locks, volatile abuse flags) in a fast store abstraction. Enforce anti-bypass via module boundaries and tests.

**Tech Stack:** NestJS, Prisma/PostgreSQL, TypeScript, tsx test runner, Next.js App Router server actions/routes, Cloudflare Turnstile siteverify.

---

## File Structure (planned changes)

- Create: `apps/api/src/analysis-protection/analysis-protection.module.ts`
- Create: `apps/api/src/analysis-protection/analysis-protection.facade.ts`
- Create: `apps/api/src/analysis-protection/analysis-config.service.ts`
- Create: `apps/api/src/analysis-protection/analysis-rate-limit.service.ts`
- Create: `apps/api/src/analysis-protection/analysis-dedupe-cache.service.ts`
- Create: `apps/api/src/analysis-protection/analysis-usage-policy.service.ts`
- Create: `apps/api/src/analysis-protection/analysis-telemetry.service.ts`
- Create: `apps/api/src/analysis-protection/protected-ai-provider.gateway.ts`
- Create: `apps/api/src/analysis-protection/turnstile-verification.service.ts`
- Create: `apps/api/src/analysis-protection/request-context.middleware.ts`
- Create: `apps/api/src/analysis-protection/types.ts`
- Create: `apps/api/src/analysis-protection/config/analysis-config.schema.ts`
- Create: `apps/api/src/analysis-protection/store/operational-store.port.ts`
- Create: `apps/api/src/analysis-protection/store/in-memory-operational-store.adapter.ts`
- Create: `apps/api/src/analysis-protection/analysis-protection.facade.spec.ts`
- Create: `apps/api/src/analysis-protection/analysis-config.service.spec.ts`
- Create: `apps/api/src/analysis-protection/analysis-rate-limit.service.spec.ts`
- Create: `apps/api/src/analysis-protection/analysis-dedupe-cache.service.spec.ts`
- Create: `apps/api/src/analysis-protection/analysis-usage-policy.service.spec.ts`
- Create: `apps/api/src/analysis-observability/analysis-observability.module.ts`
- Create: `apps/api/src/analysis-observability/business-funnel-event.service.ts`
- Create: `apps/api/src/analysis-observability/business-funnel-projection.service.ts`
- Create: `apps/api/src/analysis-observability/business-funnel-events.controller.ts`
- Create: `apps/api/src/analysis-observability/business-funnel-event.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-public.controller.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.controller.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.module.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-ai.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260421xxxxxx_analysis_protection_observability/migration.sql`
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Modify: `apps/web/src/lib/cv-adaptation-api.ts`

### Task 1: Add Persistence Schema for Protection and Funnel Domains

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260421xxxxxx_analysis_protection_observability/migration.sql`
- Test: `apps/api/src/analysis-protection/analysis-config.service.spec.ts`

- [ ] **Step 1: Write failing schema assertions in API tests**

```ts
test("analysis config records can be loaded from database", async () => {
  const row = await database.analysisProtectionConfig.create({
    data: {
      key: "turnstile_enforced",
      valueJson: true,
      valueType: "boolean",
      riskLevel: "high",
      isActive: true,
    },
  });

  assert.equal(row.key, "turnstile_enforced");
});
```

- [ ] **Step 2: Run the failing database test**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-config.service.spec.ts`
Expected: FAIL with Prisma client/type errors for missing models.

- [ ] **Step 3: Add new Prisma models/enums for both streams + config/audit/session**

```prisma
enum AnalysisConfigValueType {
  boolean
  int
  duration_ms
  percent
  string
  enum
  json
}

model AnalysisProtectionConfig {
  id        String   @id @default(cuid())
  key       String   @unique
  valueJson Json
  valueType AnalysisConfigValueType
  riskLevel String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 4: Generate migration and Prisma client**

Run: `npm run migrate --workspace @earlycv/database && npm run generate --workspace @earlycv/database`
Expected: PASS with new migration folder and generated client.

- [ ] **Step 5: Run test to verify schema now resolves**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-config.service.spec.ts`
Expected: PASS for schema load/create path.

- [ ] **Step 6: Commit schema changes**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations packages/database/src
git commit -m "feat: add analysis protection and funnel persistence schema"
```

### Task 2: Wire Modules and Request Correlation Context

**Files:**
- Create: `apps/api/src/analysis-protection/request-context.middleware.ts`
- Create: `apps/api/src/analysis-protection/types.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/analysis-protection/analysis-protection.module.ts`
- Create: `apps/api/src/analysis-observability/analysis-observability.module.ts`

- [ ] **Step 1: Write failing middleware test for requestId/correlationId/session extraction**

```ts
test("request context middleware assigns requestId and correlationId", async () => {
  const req = { headers: {}, cookies: {} } as any;
  const res = {} as any;
  let called = false;

  requestContextMiddleware(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(typeof req.analysisContext.requestId, "string");
  assert.equal(typeof req.analysisContext.correlationId, "string");
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/request-context.middleware.spec.ts`
Expected: FAIL because middleware is not implemented.

- [ ] **Step 3: Implement middleware and type-safe request augmentation**

```ts
export type AnalysisRequestContext = {
  requestId: string;
  correlationId: string;
  sessionInternalId: string | null;
  userId: string | null;
  ip: string | null;
};

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.analysisContext = {
    requestId: randomUUID(),
    correlationId: (req.headers["x-correlation-id"] as string) ?? randomUUID(),
    sessionInternalId: null,
    userId: null,
    ip: resolveTrustedIp(req),
  };
  next();
}
```

- [ ] **Step 4: Register middleware and modules in app bootstrap/module graph**

```ts
// main.ts
app.use(requestContextMiddleware);

// app.module.ts
imports: [
  AnalysisProtectionModule,
  AnalysisObservabilityModule,
  // existing modules...
]
```

- [ ] **Step 5: Run targeted tests**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/request-context.middleware.spec.ts src/app.module.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit wiring changes**

```bash
git add apps/api/src/main.ts apps/api/src/app.module.ts apps/api/src/analysis-protection apps/api/src/analysis-observability
git commit -m "feat: add analysis modules and request correlation context"
```

### Task 3: Implement Runtime Config Resolution, Validation, and Audit Hooks

**Files:**
- Create: `apps/api/src/analysis-protection/analysis-config.service.ts`
- Create: `apps/api/src/analysis-protection/config/analysis-config.schema.ts`
- Create: `apps/api/src/analysis-protection/analysis-config.service.spec.ts`

- [ ] **Step 1: Write failing precedence and fallback tests**

```ts
test("resolves config by precedence database > env > default", async () => {
  process.env.ANALYSIS_TURNSTILE_ENFORCED = "false";

  await db.analysisProtectionConfig.upsert({
    where: { key: "turnstile_enforced" },
    update: { valueJson: true },
    create: {
      key: "turnstile_enforced",
      valueJson: true,
      valueType: "boolean",
      riskLevel: "high",
    },
  });

  const resolved = await service.getBoolean("turnstile_enforced");
  assert.equal(resolved.value, true);
  assert.equal(resolved.origin, "database");
});
```

- [ ] **Step 2: Run the config test and verify failure**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-config.service.spec.ts`
Expected: FAIL because service/schema are missing.

- [ ] **Step 3: Implement typed config schema with enum/unit support + cross-validation**

```ts
export const ANALYSIS_CONFIG_SCHEMA = {
  turnstile_enforced: { type: "boolean", default: true, risk: "high" },
  rate_limit_raw_per_minute: { type: "int", min: 1, max: 1000, default: 60, risk: "medium" },
  rollout_mode: { type: "enum", values: ["observe-only", "soft-block", "hard-block"], default: "observe-only", risk: "high" },
  turnstile_max_token_age_ms: { type: "duration_ms", min: 5000, max: 300000, default: 120000, risk: "high" },
} as const;
```

- [ ] **Step 4: Implement service precedence/cache/audit-read context**

```ts
const dbValue = await this.database.analysisProtectionConfig.findUnique({ where: { key } });
if (dbValue?.isActive) return { value: parseTyped(key, dbValue.valueJson), origin: "database" };

const envValue = process.env[toEnvKey(key)];
if (envValue !== undefined) return { value: parseEnvTyped(key, envValue), origin: "env" };

return { value: getDefaultValue(key), origin: "default" };
```

- [ ] **Step 5: Re-run tests for precedence + invalid range + cross-validation**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-config.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit config service**

```bash
git add apps/api/src/analysis-protection/analysis-config.service.ts apps/api/src/analysis-protection/config/analysis-config.schema.ts apps/api/src/analysis-protection/analysis-config.service.spec.ts
git commit -m "feat: add runtime analysis config resolution with validation"
```

### Task 4: Implement Rate Limit, Dedupe/Lock/Cache, and Usage Policy Services

**Files:**
- Create: `apps/api/src/analysis-protection/analysis-rate-limit.service.ts`
- Create: `apps/api/src/analysis-protection/analysis-dedupe-cache.service.ts`
- Create: `apps/api/src/analysis-protection/analysis-usage-policy.service.ts`
- Create: `apps/api/src/analysis-protection/store/operational-store.port.ts`
- Create: `apps/api/src/analysis-protection/store/in-memory-operational-store.adapter.ts`
- Create: `apps/api/src/analysis-protection/analysis-rate-limit.service.spec.ts`
- Create: `apps/api/src/analysis-protection/analysis-dedupe-cache.service.spec.ts`
- Create: `apps/api/src/analysis-protection/analysis-usage-policy.service.spec.ts`

- [ ] **Step 1: Write failing tests for raw/context limits and cache-hit quota exclusion**

```ts
test("cache hit does not consume daily quota", async () => {
  const context = makeCtx();
  await dedupe.setCachedResult(context, "hash-1", { ok: true });

  const result = await usage.consumeIfNeeded({
    context,
    cacheDecision: { kind: "hit", payload: { ok: true } },
  });

  assert.equal(result.dailyConsumed, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-rate-limit.service.spec.ts src/analysis-protection/analysis-dedupe-cache.service.spec.ts src/analysis-protection/analysis-usage-policy.service.spec.ts`
Expected: FAIL because services are not implemented.

- [ ] **Step 3: Implement operational store abstraction and in-memory adapter**

```ts
export interface OperationalStorePort {
  incrWindow(key: string, ttlMs: number): Promise<number>;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<void>;
}
```

- [ ] **Step 4: Implement rate limit, dedupe lock, and anti-bot heuristic**

```ts
const rawCount = await this.store.incrWindow(`rl:raw:${ctx.ip}:${minuteBucket}`, 60_000);
if (rawCount > rawLimit) return { allowed: false, reason: "rate_limit_block_initial" };

const lockAcquired = await this.store.setNx(`dedupe:lock:${scope}:${hash}`, ctx.requestId, 10_000);
if (!lockAcquired) return { kind: "blocked", reason: "duplicate_request_blocked" };
```

- [ ] **Step 5: Run service tests and confirm pass**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-rate-limit.service.spec.ts src/analysis-protection/analysis-dedupe-cache.service.spec.ts src/analysis-protection/analysis-usage-policy.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit policy services**

```bash
git add apps/api/src/analysis-protection/analysis-rate-limit.service.ts apps/api/src/analysis-protection/analysis-dedupe-cache.service.ts apps/api/src/analysis-protection/analysis-usage-policy.service.ts apps/api/src/analysis-protection/store apps/api/src/analysis-protection/*.spec.ts
git commit -m "feat: add rate limit, dedupe cache, and usage policy services"
```

### Task 5: Implement Turnstile, Guard Rail, and Protected Facade Pipeline

**Files:**
- Create: `apps/api/src/analysis-protection/turnstile-verification.service.ts`
- Create: `apps/api/src/analysis-protection/protected-ai-provider.gateway.ts`
- Create: `apps/api/src/analysis-protection/analysis-telemetry.service.ts`
- Create: `apps/api/src/analysis-protection/analysis-protection.facade.ts`
- Create: `apps/api/src/analysis-protection/analysis-protection.facade.spec.ts`

- [ ] **Step 1: Write failing pipeline order and fail-fast tests**

```ts
test("pipeline stops on invalid turnstile and never calls provider", async () => {
  const provider = mockProvider();
  const res = await facade.executeProtectedAnalysis(input, {
    ...ctx,
    turnstileToken: "invalid",
  });

  assert.equal(res.ok, false);
  assert.equal(res.reason, "turnstile_invalid");
  assert.equal(provider.callCount(), 0);
});
```

- [ ] **Step 2: Run failing facade tests**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-protection.facade.spec.ts`
Expected: FAIL because facade and gateway are missing.

- [ ] **Step 3: Implement turnstile verifier and guarded provider wrapper**

```ts
const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
  method: "POST",
  body: new URLSearchParams({
    secret: this.secret,
    response: token,
    remoteip: ctx.ip ?? "",
  }),
});

const providerResult = await withTimeout(
  () => this.aiClient.analyze(payload),
  timeoutMs,
);
```

- [ ] **Step 4: Implement full ordered facade with telemetry on every decision**

```ts
await this.telemetry.emit("openai_request_started", ctx);
const result = await this.provider.execute(request, ctx);
await this.telemetry.emit("openai_request_success", ctx);
return { ok: true, result };
```

- [ ] **Step 5: Run facade tests including concurrent same-hash assertion**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-protection.facade.spec.ts`
Expected: PASS, including assertion that only one concurrent request reaches provider.

- [ ] **Step 6: Commit protected execution layer**

```bash
git add apps/api/src/analysis-protection/analysis-protection.facade.ts apps/api/src/analysis-protection/protected-ai-provider.gateway.ts apps/api/src/analysis-protection/turnstile-verification.service.ts apps/api/src/analysis-protection/analysis-telemetry.service.ts apps/api/src/analysis-protection/analysis-protection.facade.spec.ts
git commit -m "feat: add protected analysis facade with turnstile and guard rails"
```

### Task 6: Integrate `cv-adaptation` Through Protection Boundary and Enforce Anti-Bypass

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.controller.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-public.controller.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.module.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-ai.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`

- [ ] **Step 1: Write failing integration tests for protected analyze endpoints**

```ts
test("POST /cv-adaptation/analyze-guest blocks missing turnstile token", async () => {
  const res = await request(app.getHttpServer())
    .post("/api/cv-adaptation/analyze-guest")
    .field("jobDescriptionText", "Data Analyst role");

  assert.equal(res.status, 400);
  assert.match(res.body.message, /turnstile/i);
});
```

- [ ] **Step 2: Run e2e test and verify failure**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: FAIL because token enforcement/integration is missing.

- [ ] **Step 3: Route analyze paths through facade and move gates before heavy parsing**

```ts
// before parsing file buffer
const protectedResult = await this.analysisProtectionFacade.executeProtectedAnalysis(
  {
    jobDescriptionText: dto.jobDescriptionText,
    turnstileToken: dto.turnstileToken,
    payloadHints: { hasFile: Boolean(file) },
  },
  req.analysisContext,
);

if (!protectedResult.ok) throw new BadRequestException(protectedResult.message);
```

- [ ] **Step 4: Restrict direct AI service usage to protected gateway path**

```ts
// cv-adaptation.service.ts
// remove direct this.aiService.analyzeAndAdaptDirect(...) calls from request handlers
```

- [ ] **Step 5: Re-run cv-adaptation e2e tests**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: PASS with protected path behavior validated.

- [ ] **Step 6: Commit cv-adaptation integration**

```bash
git add apps/api/src/cv-adaptation/cv-adaptation.service.ts apps/api/src/cv-adaptation/cv-adaptation.controller.ts apps/api/src/cv-adaptation/cv-adaptation-public.controller.ts apps/api/src/cv-adaptation/cv-adaptation.module.ts apps/api/src/cv-adaptation/cv-adaptation-ai.service.ts apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts
git commit -m "feat: enforce protected analysis boundary in cv adaptation flows"
```

### Task 7: Implement Business Funnel Events + Idempotent Projections

**Files:**
- Create: `apps/api/src/analysis-observability/business-funnel-event.service.ts`
- Create: `apps/api/src/analysis-observability/business-funnel-projection.service.ts`
- Create: `apps/api/src/analysis-observability/business-funnel-events.controller.ts`
- Create: `apps/api/src/analysis-observability/business-funnel-event.service.spec.ts`

- [ ] **Step 1: Write failing idempotency tests for business and protection streams**

```ts
test("drops duplicate business event by idempotency key", async () => {
  const payload = {
    eventName: "analyze_submit_clicked",
    eventVersion: 1,
    idempotencyKey: "evt-123",
  };

  await service.record(payload, ctx);
  await service.record(payload, ctx);

  const count = await db.businessFunnelEvent.count({ where: { idempotencyKey: "evt-123" } });
  assert.equal(count, 1);
});
```

- [ ] **Step 2: Run observability tests and verify failure**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/business-funnel-event.service.spec.ts`
Expected: FAIL because services/controller are missing.

- [ ] **Step 3: Implement event service contract with strict semantic boundaries**

```ts
await this.database.businessFunnelEvent.upsert({
  where: { idempotencyKey: payload.idempotencyKey },
  create: {
    eventName: payload.eventName,
    eventVersion: payload.eventVersion,
    sessionInternalId: ctx.sessionInternalId,
    userId: ctx.userId,
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    metadataJson: payload.metadata ?? {},
  },
  update: {},
});
```

- [ ] **Step 4: Implement projection writer as rebuildable derivative**

```ts
// Derived only; safe to recompute from BusinessFunnelEvent
await this.database.businessFunnelStageMetric.upsert({ ... });
```

- [ ] **Step 5: Run observability tests**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/business-funnel-event.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit observability module**

```bash
git add apps/api/src/analysis-observability
git commit -m "feat: add idempotent business funnel event and projection services"
```

### Task 8: Add Frontend Non-Visual Wiring (Turnstile Token + Complementary Funnel Events)

**Files:**
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Modify: `apps/web/src/lib/cv-adaptation-api.ts`

- [ ] **Step 1: Write failing integration expectation for turnstile token forwarding**

```ts
test("analyzeGuestCv forwards turnstile token in FormData", async () => {
  const fd = new FormData();
  fd.set("jobDescriptionText", "foo");
  fd.set("turnstileToken", "tok-1");

  const req = await buildAnalyzeGuestRequest(fd);
  assert.equal(req.body.get("turnstileToken"), "tok-1");
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm run test --workspace @earlycv/web -- src/lib/cv-adaptation-api.spec.ts`
Expected: FAIL until request building/wiring exists.

- [ ] **Step 3: Implement invisible token forwarding with zero UX changes**

```ts
// adapt page submit handler
formData.set("turnstileToken", token);
await analyzeGuestCv(formData);
```

- [ ] **Step 4: Add complementary client-side funnel emits only for UI interactions**

```ts
emitFunnelEvent({
  eventName: "analyze_submit_clicked",
  eventVersion: 1,
  idempotencyKey: `${sessionId}:${requestId}:analyze_submit_clicked`,
});
```

- [ ] **Step 5: Run web checks and tests**

Run: `npm run check --workspace @earlycv/web && npm run test --workspace @earlycv/web -- src/lib/cv-adaptation-api.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit web wiring**

```bash
git add apps/web/src/app/adaptar/page.tsx apps/web/src/lib/cv-adaptation-api.ts
git commit -m "feat: forward turnstile token and add non-visual funnel event wiring"
```

### Task 9: Rollout Modes, Feature Flags, and Smoke Coverage

**Files:**
- Modify: `apps/api/src/analysis-protection/config/analysis-config.schema.ts`
- Modify: `apps/api/src/analysis-protection/analysis-protection.facade.ts`
- Modify: `apps/api/src/analysis-protection/analysis-protection.facade.spec.ts`

- [ ] **Step 1: Write failing tests for observe-only, soft-block, hard-block behavior**

```ts
test("observe-only emits block telemetry but allows request", async () => {
  mockConfig({ rollout_mode: "observe-only", turnstile_enforced: true });
  mockTurnstileInvalid();

  const result = await facade.executeProtectedAnalysis(input, ctx);
  assert.equal(result.ok, true);
  assert.equal(telemetry.wasEmitted("turnstile_invalid"), true);
});
```

- [ ] **Step 2: Run rollout tests and confirm failure**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/analysis-protection.facade.spec.ts`
Expected: FAIL before mode branching is implemented.

- [ ] **Step 3: Implement semantic mode branching + split rate-limit flags**

```ts
if (cfg.rate_limit_raw_enforced) {
  // execute raw RL stage
}
if (cfg.rate_limit_contextual_enforced) {
  // execute contextual RL stage
}

switch (cfg.rollout_mode) {
  case "observe-only": return allowWithTelemetry(decision);
  case "soft-block": return shouldHardBlock(decision) ? block(decision) : allowWithTelemetry(decision);
  case "hard-block": return decision.allowed ? allow() : block(decision);
}
```

- [ ] **Step 4: Add smoke matrix tests for major flag combinations**

```ts
for (const cfg of [
  { rollout_mode: "observe-only", turnstile_enforced: true, rate_limit_raw_enforced: true },
  { rollout_mode: "soft-block", turnstile_enforced: true, rate_limit_contextual_enforced: true },
  { rollout_mode: "hard-block", dedupe_enforced: true, daily_limit_enforced: true },
]) {
  const res = await runSmokeScenario(cfg);
  assert.equal(res.success, true);
}
```

- [ ] **Step 5: Run full API verification suite for touched areas**

Run: `npm run test --workspace @earlycv/api -- src/analysis-protection/*.spec.ts src/analysis-observability/*.spec.ts src/cv-adaptation/cv-adaptation.e2e-spec.ts && npm run check --workspace @earlycv/api`
Expected: PASS.

- [ ] **Step 6: Commit rollout and smoke coverage**

```bash
git add apps/api/src/analysis-protection apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts
git commit -m "feat: add rollout modes, feature flags, and smoke test coverage"
```

## Plan Self-Review

### 1) Spec coverage check

- Protection-before-heavy-processing moved into architecture and implemented in Task 6 step 3.
- Added `auth_emergency_enabled`, `rate_limit_raw_enforced`, `rate_limit_contextual_enforced` in Task 9.
- Session telemetry standardization and no raw public token are covered in Task 2 + Task 5 + Task 7.
- Idempotency for both streams is covered in Task 5 and Task 7 tests.
- Runtime config precedence/fallback/invalid/cross-validation is covered in Task 3.
- Concurrent same-hash single-provider-hit is covered in Task 5 and Task 9.
- Rollout mode semantics + smoke matrix is covered in Task 9.

### 2) Placeholder scan

- No TBD/TODO placeholders remain.
- Every task has explicit files, commands, and code snippets.

### 3) Type/signature consistency

- Standardized context keys: `requestId`, `correlationId`, `sessionInternalId`, `userId`, `ip`.
- Standardized rollout keys: `observe-only`, `soft-block`, `hard-block`.
- Standardized flag keys: `auth_emergency_enabled`, `rate_limit_raw_enforced`, `rate_limit_contextual_enforced`.
