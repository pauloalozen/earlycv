# Freemium Analise + Creditos Separados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar limite diario de analises por plano com reset em America/Sao_Paulo, manter creditos de analise separados de creditos de download, e expor/operar esses dados em API, admin e dashboard.

**Architecture:** O backend passa a controlar dois saldos independentes no usuario (`analysisCreditsRemaining` e `creditsRemaining`) e um agregado diario por usuario/data (`UserDailyAnalysisUsage`). O endpoint autenticado de analise consome credito de analise e uso diario em transacao atomica. `GET /plans/me` vira a fonte unica para estado de plano + limites diarios + saldos, e o frontend (admin/dashboard) apenas renderiza e opera sobre esse contrato.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js App Router, TypeScript, node:test, supertest, Biome.

---

## File Structure (lock-in)

- Create: `apps/api/src/plans/analysis-limit.ts` (resolver de limite diario + helpers de data de negocio)
- Create: `apps/api/src/plans/analysis-limit.spec.ts` (testes unitarios de limite/env/date)
- Create: `apps/api/src/admin-users/dto/set-admin-user-analysis-credits.dto.ts` (DTO de ajuste admin)
- Create: `apps/web/src/app/admin/usuarios/[id]/set-analysis-credits-form.tsx` (form client para credito de analise)
- Modify: `packages/database/prisma/schema.prisma` (novo saldo e tabela de uso diario)
- Create: `packages/database/prisma/migrations/20260414130000_analysis_credits_and_daily_usage/migration.sql`
- Modify: `apps/api/src/plans/plans.service.ts` (payload `/plans/me`, acumulacao na compra, leitura do uso diario)
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts` (gating + consumo atomico em `/analyze`)
- Modify: `apps/api/src/admin-users/admin-users.controller.ts` (novo endpoint `analysis-credits`)
- Modify: `apps/api/src/admin-users/admin-users.service.ts` (persistencia do saldo de analise)
- Modify: `apps/api/src/admin-users/admin-users.e2e-spec.ts` (cobertura do novo endpoint)
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts` (cobertura de consumo/bloqueio diario)
- Modify: `apps/web/src/lib/admin-users-api.ts` (novo campo e mutacao)
- Modify: `apps/web/src/app/admin/usuarios/[id]/actions.ts` (server action do novo form)
- Modify: `apps/web/src/app/admin/usuarios/[id]/page.tsx` (novo card de ajuste)
- Modify: `apps/web/src/lib/plans-api.ts` (tipo expandido de `PlanInfo`)
- Modify: `apps/web/src/app/dashboard/page.tsx` (sinais de credito analise + limite diario + credito download)
- Modify: `.env.example` (documentar envs de limite diario e creditos de analise de pacote)

---

### Task 1: Base de limites diarios (TDD puro)

**Files:**
- Create: `apps/api/src/plans/analysis-limit.spec.ts`
- Create: `apps/api/src/plans/analysis-limit.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSaoPauloUsageDate,
  resolveDailyAnalysisLimit,
} from "./analysis-limit";

test("resolveDailyAnalysisLimit maps plan env values", () => {
  const env = {
    QNT_AN_PLAN_FREE: "3",
    QNT_AN_PLAN_STARTER: "6",
    QNT_AN_PLAN_PRO: "9",
    QNT_AN_PLAN_TURBO: "30",
  } as NodeJS.ProcessEnv;

  assert.equal(resolveDailyAnalysisLimit("free", env), 3);
  assert.equal(resolveDailyAnalysisLimit("starter", env), 6);
  assert.equal(resolveDailyAnalysisLimit("pro", env), 9);
  assert.equal(resolveDailyAnalysisLimit("turbo", env), 30);
  assert.equal(resolveDailyAnalysisLimit("unlimited", env), null);
});

test("buildSaoPauloUsageDate normalizes to local business day", () => {
  const date = buildSaoPauloUsageDate(new Date("2026-04-14T23:40:00.000Z"));
  assert.equal(date.toISOString(), "2026-04-14T03:00:00.000Z");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/plans/analysis-limit.spec.ts`
Expected: FAIL with module/function not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { UserPlanType } from "@prisma/client";

const SAO_PAULO_TZ = "America/Sao_Paulo";

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? String(fallback), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveDailyAnalysisLimit(
  planType: UserPlanType,
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  if (planType === "unlimited") return null;

  const map = {
    free: toPositiveInt(env.QNT_AN_PLAN_FREE, 3),
    starter: toPositiveInt(env.QNT_AN_PLAN_STARTER, 6),
    pro: toPositiveInt(env.QNT_AN_PLAN_PRO, 9),
    turbo: toPositiveInt(env.QNT_AN_PLAN_TURBO, 30),
  } as const;

  return map[planType];
}

export function buildSaoPauloUsageDate(now: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const yyyy = parts.find((p) => p.type === "year")?.value;
  const mm = parts.find((p) => p.type === "month")?.value;
  const dd = parts.find((p) => p.type === "day")?.value;

  if (!yyyy || !mm || !dd) {
    throw new Error("Failed to build Sao Paulo business date");
  }

  return new Date(`${yyyy}-${mm}-${dd}T00:00:00-03:00`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/api -- src/plans/analysis-limit.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plans/analysis-limit.ts apps/api/src/plans/analysis-limit.spec.ts .env.example
git commit -m "feat: add daily analysis limit resolver and Sao Paulo date helper"
```

---

### Task 2: Schema + migration + `/plans/me` enriched response

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260414130000_analysis_credits_and_daily_usage/migration.sql`
- Modify: `apps/api/src/plans/plans.service.ts`
- Modify: `apps/web/src/lib/plans-api.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("/api/plans/me returns analysis credits and daily usage fields", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "plans-me-analysis-fields");

  await database.user.update({
    where: { id: user.userId },
    data: {
      planType: "starter",
      analysisCreditsRemaining: 5,
      creditsRemaining: 2,
    },
  });

  const usageDate = new Date("2026-04-14T03:00:00.000Z");
  await database.userDailyAnalysisUsage.create({
    data: { userId: user.userId, usageDate, usedCount: 2 },
  });

  await request(app.getHttpServer())
    .get("/api/plans/me")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.analysisCreditsRemaining, 5);
      assert.equal(body.dailyAnalysisLimit, 6);
      assert.equal(body.dailyAnalysisUsed, 2);
      assert.equal(body.dailyAnalysisRemaining, 4);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: FAIL due to missing Prisma fields/table and missing payload fields.

- [ ] **Step 3: Write minimal implementation**

```prisma
model User {
  // ...
  analysisCreditsRemaining Int @default(0)
  dailyAnalysisUsages UserDailyAnalysisUsage[]
}

model UserDailyAnalysisUsage {
  id        String   @id @default(cuid())
  userId    String
  usageDate DateTime
  usedCount Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, usageDate])
  @@index([usageDate])
}
```

```sql
ALTER TABLE "User" ADD COLUMN "analysisCreditsRemaining" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "UserDailyAnalysisUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "usageDate" TIMESTAMP(3) NOT NULL,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserDailyAnalysisUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDailyAnalysisUsage_userId_usageDate_key"
ON "UserDailyAnalysisUsage"("userId", "usageDate");

ALTER TABLE "UserDailyAnalysisUsage"
ADD CONSTRAINT "UserDailyAnalysisUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

```ts
return {
  planType: resolvedPlan,
  creditsRemaining: resolvedCredits,
  analysisCreditsRemaining: isUnlimited ? null : user.analysisCreditsRemaining,
  dailyAnalysisLimit,
  dailyAnalysisUsed,
  dailyAnalysisRemaining,
  planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
  isActive,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: PASS for the new `/plans/me` assertion and existing scenarios.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260414130000_analysis_credits_and_daily_usage/migration.sql apps/api/src/plans/plans.service.ts apps/web/src/lib/plans-api.ts
git commit -m "feat: add analysis credits and daily usage to plans me payload"
```

---

### Task 3: Enforce analysis credit + daily limit on authenticated analyze

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("authenticated analyze decrements analysis credits and increments daily usage", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "analyze-daily-limit");

  await database.user.update({
    where: { id: user.userId },
    data: { planType: "starter", analysisCreditsRemaining: 2 },
  });

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV",
      kind: "master",
      status: "uploaded",
      rawText: "Resumo profissional",
      sourceFileType: "application/pdf",
    },
  });

  await request(app.getHttpServer())
    .post("/api/cv-adaptation/analyze")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao vaga",
    })
    .expect(201);

  const refreshed = await database.user.findUnique({
    where: { id: user.userId },
    select: { analysisCreditsRemaining: true },
  });
  assert.equal(refreshed?.analysisCreditsRemaining, 1);
});

test("authenticated analyze blocks when daily limit is reached", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "analyze-limit-reached");

  await database.user.update({
    where: { id: user.userId },
    data: { planType: "starter", analysisCreditsRemaining: 3 },
  });

  const usageDate = new Date("2026-04-14T03:00:00.000Z");
  await database.userDailyAnalysisUsage.create({
    data: {
      userId: user.userId,
      usageDate,
      usedCount: 6,
    },
  });

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV",
      kind: "master",
      status: "uploaded",
      rawText: "Resumo profissional",
      sourceFileType: "application/pdf",
    },
  });

  await request(app.getHttpServer())
    .post("/api/cv-adaptation/analyze")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao vaga",
    })
    .expect(400)
    .expect(({ body }) => {
      assert.equal(
        body.message,
        "Você atingiu o limite diário de análises do seu plano.",
      );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: FAIL because analyze path does not consume analysis credits nor daily usage.

- [ ] **Step 3: Write minimal implementation**

```ts
// inside analyzeAuthenticated before aiService call
const usageDate = buildSaoPauloUsageDate(new Date());

await this.database.$transaction(async (tx) => {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      internalRole: true,
      planType: true,
      analysisCreditsRemaining: true,
    },
  });

  const hasBypass = user.internalRole === "superadmin" || user.planType === "unlimited";
  const usage = await tx.userDailyAnalysisUsage.upsert({
    where: { userId_usageDate: { userId, usageDate } },
    update: {},
    create: { userId, usageDate, usedCount: 0 },
  });

  if (!hasBypass) {
    const dailyLimit = resolveDailyAnalysisLimit(user.planType);
    if (user.analysisCreditsRemaining < 1) {
      throw new BadRequestException("Você não tem créditos de análise disponíveis.");
    }
    if (dailyLimit !== null && usage.usedCount >= dailyLimit) {
      throw new BadRequestException("Você atingiu o limite diário de análises do seu plano.");
    }

    await tx.user.update({
      where: { id: userId },
      data: { analysisCreditsRemaining: { decrement: 1 } },
    });
    await tx.userDailyAnalysisUsage.update({
      where: { userId_usageDate: { userId, usageDate } },
      data: { usedCount: { increment: 1 } },
    });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: PASS for both new tests and no regression in existing claim/redeem tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cv-adaptation/cv-adaptation.service.ts apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts
git commit -m "feat: enforce daily analysis limits and analysis credit consumption"
```

---

### Task 4: Admin endpoint + admin UI for analysis credits

**Files:**
- Create: `apps/api/src/admin-users/dto/set-admin-user-analysis-credits.dto.ts`
- Modify: `apps/api/src/admin-users/admin-users.controller.ts`
- Modify: `apps/api/src/admin-users/admin-users.service.ts`
- Modify: `apps/api/src/admin-users/admin-users.e2e-spec.ts`
- Modify: `apps/web/src/lib/admin-users-api.ts`
- Modify: `apps/web/src/app/admin/usuarios/[id]/actions.ts`
- Create: `apps/web/src/app/admin/usuarios/[id]/set-analysis-credits-form.tsx`
- Modify: `apps/web/src/app/admin/usuarios/[id]/page.tsx`

- [ ] **Step 1: Write the failing test**

```ts
await request(app.getHttpServer())
  .patch(`/api/admin/users/${productUser.userId}/analysis-credits`)
  .set("Authorization", `Bearer ${admin.accessToken}`)
  .send({ analysisCreditsRemaining: 11 })
  .expect(200)
  .expect(({ body }) => {
    assert.equal(body.analysisCreditsRemaining, 11);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/admin-users/admin-users.e2e-spec.ts`
Expected: FAIL with 404 route not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// dto/set-admin-user-analysis-credits.dto.ts
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class SetAdminUserAnalysisCreditsDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  analysisCreditsRemaining!: number;
}
```

```ts
// controller
@Patch(":id/analysis-credits")
setAnalysisCredits(
  @Param("id") id: string,
  @Body(new ValidationPipe({ ...adminUsersValidationOptions, expectedType: SetAdminUserAnalysisCreditsDto }))
  dto: SetAdminUserAnalysisCreditsDto,
) {
  return this.adminUsersService.setAnalysisCredits(id, dto);
}
```

```tsx
// page.tsx (new card usage)
<SetAnalysisCreditsForm
  currentAnalysisCredits={user.analysisCreditsRemaining}
  setAnalysisCreditsAction={setUserAnalysisCreditsAction.bind(null, user.id)}
/>
```

- [ ] **Step 4: Run tests/checks to verify it passes**

Run: `npm run test --workspace @earlycv/api -- src/admin-users/admin-users.e2e-spec.ts`
Expected: PASS including new endpoint assertions.

Run: `npm run check --workspace @earlycv/web`
Expected: PASS for admin form/action/page changes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin-users apps/web/src/lib/admin-users-api.ts apps/web/src/app/admin/usuarios/[id]/actions.ts apps/web/src/app/admin/usuarios/[id]/set-analysis-credits-form.tsx apps/web/src/app/admin/usuarios/[id]/page.tsx
git commit -m "feat: let admin adjust analysis credits per user"
```

---

### Task 5: Dashboard and web contract for dual credits + daily counters

**Files:**
- Modify: `apps/web/src/lib/plans-api.ts`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/lib/plan-credits.ts`
- Modify: `apps/web/src/lib/plan-credits.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { hasAvailableAnalysisCredits } from "./plan-credits";

test("hasAvailableAnalysisCredits respects null and positive values", () => {
  assert.equal(hasAvailableAnalysisCredits({ analysisCreditsRemaining: null }), true);
  assert.equal(hasAvailableAnalysisCredits({ analysisCreditsRemaining: 1 }), true);
  assert.equal(hasAvailableAnalysisCredits({ analysisCreditsRemaining: 0 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/plans/analysis-limit.spec.ts`
Expected: PASS (baseline)

Run: `node --test apps/web/src/lib/plan-credits.spec.ts`
Expected: FAIL with missing `hasAvailableAnalysisCredits`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type PlanCreditsInfo = {
  creditsRemaining: number | null;
  analysisCreditsRemaining?: number | null;
};

export function hasAvailableCredits(plan: PlanCreditsInfo | null): boolean {
  if (!plan) return false;
  return plan.creditsRemaining === null || plan.creditsRemaining > 0;
}

export function hasAvailableAnalysisCredits(plan: PlanCreditsInfo | null): boolean {
  if (!plan) return false;
  return (
    plan.analysisCreditsRemaining === null ||
    (plan.analysisCreditsRemaining ?? 0) > 0
  );
}
```

```tsx
// dashboard "Visao geral" metrics
<p className="text-xs text-[#999999]">Créditos análise</p>
<p className="mt-0.5 text-lg font-bold leading-none text-[#111111]">{planInfo?.analysisCreditsRemaining ?? 0}</p>

<p className="text-xs text-[#999999]">Análises hoje</p>
<p className="mt-0.5 text-lg font-bold leading-none text-[#111111]">
  {planInfo?.dailyAnalysisUsed ?? 0}/{planInfo?.dailyAnalysisLimit ?? "∞"}
</p>

<p className="text-xs text-[#999999]">Restante hoje</p>
<p className="mt-0.5 text-lg font-bold leading-none text-[#111111]">{planInfo?.dailyAnalysisRemaining ?? "∞"}</p>

<p className="text-[11px] text-[#888888]">Limite diário reinicia às 00:00 (America/Sao_Paulo).</p>
```

- [ ] **Step 4: Run checks to verify it passes**

Run: `node --test apps/web/src/lib/plan-credits.spec.ts`
Expected: PASS.

Run: `npm run check --workspace @earlycv/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/plans-api.ts apps/web/src/lib/plan-credits.ts apps/web/src/lib/plan-credits.spec.ts apps/web/src/app/dashboard/page.tsx
git commit -m "feat: surface analysis credits and daily limits on dashboard"
```

---

### Task 6: Compra de pacote soma saldos (analise + download)

**Files:**
- Modify: `apps/api/src/plans/plans.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```ts
test("plan activation accumulates existing balances instead of replacing", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "plans-accumulate");

  await database.user.update({
    where: { id: user.userId },
    data: {
      creditsRemaining: 1,
      analysisCreditsRemaining: 2,
    },
  });

  await (app.get(PlansService) as PlansService)["activatePlan"](
    user.userId,
    "starter",
    3,
    6,
  );

  const refreshed = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true, analysisCreditsRemaining: true },
  });

  assert.equal(refreshed?.creditsRemaining, 4);
  assert.equal(refreshed?.analysisCreditsRemaining, 8);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: FAIL because activation logic does not increment both balances.

- [ ] **Step 3: Write minimal implementation**

```ts
type PlanId = "starter" | "pro" | "turbo";

const PLAN_CONFIG: Record<PlanId, {
  label: string;
  amountInCents: number;
  downloadCreditsGranted: number;
  analysisCreditsGranted: number;
}> = {
  starter: {
    label: `${process.env.QNT_CV_PLAN_STARTER ?? "1"} CV Otimizado — EarlyCV`,
    amountInCents: parseInt(process.env.PRICE_PLAN_STARTER ?? "1190", 10),
    downloadCreditsGranted: parseInt(process.env.QNT_CV_PLAN_STARTER ?? "1", 10),
    analysisCreditsGranted: parseInt(
      process.env.QNT_AN_CREDIT_PLAN_STARTER ?? process.env.QNT_AN_PLAN_STARTER ?? "6",
      10,
    ),
  },
  pro: {
    label: `${process.env.QNT_CV_PLAN_PRO ?? "3"} CVs Otimizados — EarlyCV`,
    amountInCents: parseInt(process.env.PRICE_PLAN_PRO ?? "2990", 10),
    downloadCreditsGranted: parseInt(process.env.QNT_CV_PLAN_PRO ?? "3", 10),
    analysisCreditsGranted: parseInt(
      process.env.QNT_AN_CREDIT_PLAN_PRO ?? process.env.QNT_AN_PLAN_PRO ?? "9",
      10,
    ),
  },
  turbo: {
    label: `${process.env.QNT_CV_PLAN_TURBO ?? "10"} CVs Otimizados — EarlyCV`,
    amountInCents: parseInt(process.env.PRICE_PLAN_TURBO ?? "5990", 10),
    downloadCreditsGranted: parseInt(process.env.QNT_CV_PLAN_TURBO ?? "10", 10),
    analysisCreditsGranted: parseInt(
      process.env.QNT_AN_CREDIT_PLAN_TURBO ?? process.env.QNT_AN_PLAN_TURBO ?? "30",
      10,
    ),
  },
};

// activation
await this.database.user.update({
  where: { id: userId },
  data: {
    planType,
    planActivatedAt: new Date(),
    planExpiresAt,
    creditsRemaining: isUnlimited ? 0 : { increment: downloadCreditsGranted },
    analysisCreditsRemaining: isUnlimited ? 0 : { increment: analysisCreditsGranted },
  },
});
```

- [ ] **Step 4: Run tests/checks to verify it passes**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts src/admin-users/admin-users.e2e-spec.ts`
Expected: PASS; no regression in existing credits flow.

Run: `npm run check --workspace @earlycv/api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plans/plans.service.ts apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts .env.example
git commit -m "feat: accumulate purchased analysis and download credits on plan activation"
```

---

## Final Verification Gate

- [ ] Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts src/admin-users/admin-users.e2e-spec.ts src/plans/analysis-limit.spec.ts`
- [ ] Run: `npm run check --workspace @earlycv/api`
- [ ] Run: `npm run check --workspace @earlycv/web`
- [ ] Run: `npm run build --workspace @earlycv/api`
- [ ] Run: `npm run build --workspace @earlycv/web`

Expected: all commands PASS with no new lint/type/test failures.
