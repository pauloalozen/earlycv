# Backend Core Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real EarlyCV backend domain slice with canonical database schema, JWT + refresh-token auth, Google/LinkedIn social login, and CRUD API modules for profiles, resumes, companies, job sources, and jobs.

**Architecture:** `packages/database` becomes the source of truth for the first domain schema, migrations, seeds, and Prisma client. `apps/api` grows from bootstrap into modular NestJS domains, with `auth` owning identity/session flows and the remaining modules owning explicit persistence boundaries. `apps/web` remains on the current mock seam during this slice.

**Tech Stack:** NestJS, Prisma, PostgreSQL, JWT, Passport, OAuth 2.0, TypeScript, Biome, npm workspaces

---

## File Structure Map

- Modify: `packages/database/prisma/schema.prisma` - first real domain schema
- Create: `packages/database/prisma/seed.ts` - local development seed entrypoint
- Modify: `packages/database/package.json` - seed script and deps
- Modify: `packages/database/src/client.ts` - Prisma bootstrap may need small updates for the real schema
- Create: `packages/database/src/schema.spec.ts` - schema invariant tests via Prisma metadata / package contracts
- Modify: `apps/api/package.json` - auth/security/runtime dependencies and scripts
- Modify: `apps/api/src/app.module.ts` - register domain modules
- Modify: `apps/api/src/config/env.module.ts` - extend validated env for JWT and OAuth providers
- Create: `apps/api/src/common/**` - shared guards, decorators, DTO helpers, serialization helpers
- Create: `apps/api/src/database/**` - Nest Prisma module/service wrapper around `@earlycv/database`
- Create: `apps/api/src/auth/**` - auth module, strategies, DTOs, controller, service, tests
- Create: `apps/api/src/users/**` - user sanitization/read service
- Create: `apps/api/src/profiles/**` - authenticated profile module
- Create: `apps/api/src/resumes/**` - authenticated resume metadata module
- Create: `apps/api/src/companies/**` - company CRUD module
- Create: `apps/api/src/job-sources/**` - job-source CRUD module
- Create: `apps/api/src/jobs/**` - job CRUD module with `first_seen_at`
- Create: `apps/api/src/test/**` - reusable test app/bootstrap helpers if needed

### Task 1: Expand `packages/database` into the first real domain schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/package.json`
- Create: `packages/database/prisma/seed.ts`
- Create: `packages/database/src/schema.spec.ts`
- Test: `packages/database/src/schema.spec.ts`

- [ ] **Step 1: Write the failing schema contract test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

test("database schema defines auth, profile, resume, company, job source, and job models", () => {
  for (const model of [
    "model User",
    "model UserProfile",
    "model AuthAccount",
    "model RefreshToken",
    "model Resume",
    "model Company",
    "model JobSource",
    "model Job",
  ]) {
    assert.equal(schema.includes(model), true);
  }

  assert.equal(schema.includes("firstSeenAt"), true);
  assert.equal(schema.includes("canonicalKey"), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @earlycv/database`
Expected: FAIL because the current Prisma schema only contains datasource/generator scaffolding.

- [ ] **Step 3: Implement the minimal real Prisma schema, enums, and seed script**

```prisma
enum UserStatus {
  ACTIVE
  PENDING
  SUSPENDED
  DELETED
}

enum AuthProvider {
  CREDENTIALS
  GOOGLE
  LINKEDIN
}

enum JobStatus {
  ACTIVE
  INACTIVE
  REMOVED
}

model User {
  id            String         @id @default(cuid())
  email         String         @unique
  passwordHash  String?
  name          String
  planType      String         @default("free")
  status        UserStatus     @default(PENDING)
  emailVerifiedAt DateTime?
  lastLoginAt   DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  profile       UserProfile?
  authAccounts  AuthAccount[]
  refreshTokens RefreshToken[]
  resumes       Resume[]
}

model Job {
  id                String    @id @default(cuid())
  companyId         String
  jobSourceId       String
  sourceJobUrl      String
  canonicalKey      String
  title             String
  normalizedTitle   String
  descriptionRaw    String
  descriptionClean  String
  locationText      String
  city              String?
  state             String?
  country           String?
  workModel         String?
  seniorityLevel    String?
  employmentType    String?
  publishedAtSource DateTime?
  firstSeenAt       DateTime
  lastSeenAt        DateTime
  status            JobStatus  @default(ACTIVE)
  metadataJson      Json?
  company           Company    @relation(fields: [companyId], references: [id])
  jobSource         JobSource  @relation(fields: [jobSourceId], references: [id])

  @@index([companyId])
  @@index([jobSourceId])
  @@index([firstSeenAt])
  @@unique([canonicalKey])
}
```

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { normalizedName: "earlycv-demo" },
    update: {},
    create: {
      name: "EarlyCV Demo",
      normalizedName: "earlycv-demo",
      country: "BR",
    },
  });

  await prisma.jobSource.upsert({
    where: { companyId_sourceUrl: { companyId: company.id, sourceUrl: "https://careers.earlycv.dev" } },
    update: {},
    create: {
      companyId: company.id,
      sourceName: "Career Site",
      sourceType: "custom_html",
      sourceUrl: "https://careers.earlycv.dev",
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 30,
    },
  });
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Generate the client and create the first migration**

Run: `npm run generate --workspace @earlycv/database && npm run migrate --workspace @earlycv/database -- --name init_backend_core_slice_1`
Expected: Prisma client and first domain migration are created successfully.

- [ ] **Step 5: Re-run the database tests**

Run: `npm test --workspace @earlycv/database`
Expected: PASS with the schema contract test and the existing database package tests.

- [ ] **Step 6: Commit**

```bash
git add packages/database
git commit -m "feat: add initial backend core database schema"
```

### Task 2: Add API database integration and shared auth-ready config

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config/env.module.ts`
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/database.service.ts`
- Create: `apps/api/src/database/database.service.spec.ts`
- Test: `apps/api/src/database/database.service.spec.ts`

- [ ] **Step 1: Write the failing Prisma/Nest integration test**

```ts
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { test } from "node:test";

import { DatabaseModule } from "./database.module";
import { DatabaseService } from "./database.service";

test("DatabaseModule exposes the shared Prisma-backed database service", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
  }).compile();

  const service = moduleRef.get(DatabaseService);

  assert.equal(typeof service.user.findMany, "function");
  await moduleRef.close();
});
```

- [ ] **Step 2: Run the API tests to verify failure**

Run: `npm test --workspace @earlycv/api`
Expected: FAIL because `DatabaseModule` and `DatabaseService` do not exist yet.

- [ ] **Step 3: Add dependencies, env validation, and database wrapper**

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createDatabaseClient } from "@earlycv/database";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma = createDatabaseClient();

  get user() {
    return this.prisma.user;
  }

  get resume() {
    return this.prisma.resume;
  }

  get company() {
    return this.prisma.company;
  }

  get jobSource() {
    return this.prisma.jobSource;
  }

  get job() {
    return this.prisma.job;
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
```

```ts
API_PORT: { default: "4000", parse: envToNumber },
JWT_ACCESS_SECRET: { required: true },
JWT_REFRESH_SECRET: { required: true },
JWT_ACCESS_TTL: { default: "900" },
JWT_REFRESH_TTL: { default: "2592000" },
GOOGLE_CLIENT_ID: { required: true },
GOOGLE_CLIENT_SECRET: { required: true },
GOOGLE_CALLBACK_URL: { required: true },
LINKEDIN_CLIENT_ID: { required: true },
LINKEDIN_CLIENT_SECRET: { required: true },
LINKEDIN_CALLBACK_URL: { required: true },
```

- [ ] **Step 4: Re-run the focused API test**

Run: `npm test --workspace @earlycv/api -- src/database/database.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/config/env.module.ts apps/api/src/database
git commit -m "feat: add Prisma integration to API"
```

### Task 3: Implement credential auth and token lifecycle

**Files:**
- Create: `apps/api/src/common/authenticated-user.decorator.ts`
- Create: `apps/api/src/common/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/dto/refresh.dto.ts`
- Create: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Create: `apps/api/src/auth/strategies/local.strategy.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/auth/auth.e2e-spec.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`
- Test: `apps/api/src/auth/auth.e2e-spec.ts`

- [ ] **Step 1: Write the failing auth service and e2e tests**

```ts
test("AuthService registers a user and stores a hashed refresh token", async () => {
  const result = await service.register({
    email: "ana@earlycv.dev",
    password: "super-secret-123",
    name: "Ana Silva",
  });

  assert.equal(typeof result.accessToken, "string");
  assert.equal(typeof result.refreshToken, "string");

  const refreshRows = await database.refreshToken.findMany();
  assert.equal(refreshRows.length, 1);
  assert.notEqual(refreshRows[0]?.tokenHash, result.refreshToken);
});
```

```ts
test("POST /auth/login returns access and refresh tokens for valid credentials", async () => {
  await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({ email: "ana@earlycv.dev", password: "super-secret-123" })
    .expect(201)
    .expect(({ body }) => {
      assert.equal(typeof body.accessToken, "string");
      assert.equal(typeof body.refreshToken, "string");
    });
});
```

- [ ] **Step 2: Run the auth tests to verify they fail**

Run: `npm test --workspace @earlycv/api -- src/auth/auth.service.spec.ts src/auth/auth.e2e-spec.ts`
Expected: FAIL because the auth module, DTOs, and token flows do not exist.

- [ ] **Step 3: Implement minimal credential auth, JWT issuance, refresh rotation, and `me`**

```ts
async register(input: RegisterDto) {
  const passwordHash = await argon2.hash(input.password);
  const user = await this.database.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      status: "ACTIVE",
      profile: { create: {} },
      authAccounts: {
        create: {
          provider: "CREDENTIALS",
          providerAccountId: input.email,
          providerEmail: input.email,
        },
      },
    },
  });

  return this.issueSession(user.id);
}

async refresh(input: RefreshDto) {
  const session = await this.findValidRefreshToken(input.refreshToken);
  await this.database.refreshToken.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
  return this.issueSession(session.userId);
}
```

- [ ] **Step 4: Run the auth tests again**

Run: `npm test --workspace @earlycv/api -- src/auth/auth.service.spec.ts src/auth/auth.e2e-spec.ts`
Expected: PASS for register, login, refresh, logout, and `me`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common apps/api/src/auth apps/api/package.json
git commit -m "feat: add credential auth with JWT refresh flow"
```

### Task 4: Implement Google and LinkedIn social auth flows

**Files:**
- Create: `apps/api/src/auth/strategies/google.strategy.ts`
- Create: `apps/api/src/auth/strategies/linkedin.strategy.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/social-auth.spec.ts`
- Test: `apps/api/src/auth/social-auth.spec.ts`

- [ ] **Step 1: Write the failing social-auth linking tests**

```ts
test("social login links a Google account to an existing user by verified email", async () => {
  const user = await database.user.create({
    data: { email: "ana@earlycv.dev", name: "Ana Silva", status: "ACTIVE" },
  });

  const session = await service.finishSocialLogin({
    provider: "GOOGLE",
    providerAccountId: "google-123",
    email: "ana@earlycv.dev",
    name: "Ana Silva",
    emailVerified: true,
  });

  const linked = await database.authAccount.findFirst({ where: { userId: user.id, provider: "GOOGLE" } });
  assert.equal(Boolean(linked), true);
  assert.equal(typeof session.accessToken, "string");
});
```

- [ ] **Step 2: Run the social-auth test to verify failure**

Run: `npm test --workspace @earlycv/api -- src/auth/social-auth.spec.ts`
Expected: FAIL because provider strategies and social-login completion logic do not exist.

- [ ] **Step 3: Implement provider strategies and callback handling**

```ts
@Controller("auth/google")
export class GoogleAuthController {
  @Get("start")
  @UseGuards(AuthGuard("google"))
  startGoogleLogin() {}

  @Get("callback")
  @UseGuards(AuthGuard("google"))
  async googleCallback(@Req() req: RequestWithOAuthUser) {
    return this.authService.finishSocialLogin(req.oauthUser);
  }
}
```

```ts
async finishSocialLogin(profile: SocialProfileInput) {
  const existingByProvider = await this.database.authAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  });

  if (existingByProvider) {
    return this.issueSession(existingByProvider.userId);
  }

  const user = await this.findOrCreateUserForVerifiedSocialProfile(profile);
  await this.database.authAccount.create({ data: { userId: user.id, ...mappedProviderData } });
  return this.issueSession(user.id);
}
```

- [ ] **Step 4: Re-run the social-auth tests**

Run: `npm test --workspace @earlycv/api -- src/auth/social-auth.spec.ts`
Expected: PASS for Google and LinkedIn provider-linking behaviors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat: add Google and LinkedIn auth flows"
```

### Task 5: Add authenticated profile and resume modules

**Files:**
- Create: `apps/api/src/profiles/profiles.module.ts`
- Create: `apps/api/src/profiles/profiles.controller.ts`
- Create: `apps/api/src/profiles/profiles.service.ts`
- Create: `apps/api/src/profiles/dto/update-profile.dto.ts`
- Create: `apps/api/src/profiles/profiles.e2e-spec.ts`
- Create: `apps/api/src/resumes/resumes.module.ts`
- Create: `apps/api/src/resumes/resumes.controller.ts`
- Create: `apps/api/src/resumes/resumes.service.ts`
- Create: `apps/api/src/resumes/dto/create-resume.dto.ts`
- Create: `apps/api/src/resumes/dto/update-resume.dto.ts`
- Create: `apps/api/src/resumes/resumes.e2e-spec.ts`
- Test: `apps/api/src/profiles/profiles.e2e-spec.ts`
- Test: `apps/api/src/resumes/resumes.e2e-spec.ts`

- [ ] **Step 1: Write failing authenticated ownership tests**

```ts
test("PUT /api/users/profile updates only the authenticated user's profile", async () => {
  await request(server)
    .put("/api/users/profile")
    .set("Authorization", `Bearer ${userOneToken}`)
    .send({ headline: "Senior Data Analyst" })
    .expect(200);

  const ownProfile = await prisma.userProfile.findUnique({ where: { userId: userOneId } });
  const otherProfile = await prisma.userProfile.findUnique({ where: { userId: userTwoId } });
  assert.equal(ownProfile?.headline, "Senior Data Analyst");
  assert.notEqual(otherProfile?.headline, "Senior Data Analyst");
});
```

```ts
test("POST /api/resumes/:id/set-primary clears the previous primary resume", async () => {
  await request(server)
    .post(`/api/resumes/${secondResumeId}/set-primary`)
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  const resumes = await prisma.resume.findMany({ where: { userId } });
  assert.equal(resumes.filter((resume) => resume.isPrimary).length, 1);
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test --workspace @earlycv/api -- src/profiles/profiles.e2e-spec.ts src/resumes/resumes.e2e-spec.ts`
Expected: FAIL because the modules/controllers/services do not exist.

- [ ] **Step 3: Implement profile and resume modules with JWT scoping**

```ts
@UseGuards(JwtAuthGuard)
@Controller("users/profile")
export class ProfilesController {
  @Get()
  getProfile(@AuthenticatedUser() user: AuthUser) {
    return this.profilesService.getByUserId(user.id);
  }

  @Put()
  updateProfile(@AuthenticatedUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profilesService.update(user.id, dto);
  }
}
```

```ts
async setPrimary(userId: string, resumeId: string) {
  await this.database.$transaction([
    this.database.resume.updateMany({ where: { userId }, data: { isPrimary: false } }),
    this.database.resume.update({ where: { id: resumeId, userId }, data: { isPrimary: true } }),
  ]);
}
```

- [ ] **Step 4: Re-run the profile/resume tests**

Run: `npm test --workspace @earlycv/api -- src/profiles/profiles.e2e-spec.ts src/resumes/resumes.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/profiles apps/api/src/resumes
git commit -m "feat: add authenticated profile and resume modules"
```

### Task 6: Add company and job-source catalog modules

**Files:**
- Create: `apps/api/src/companies/companies.module.ts`
- Create: `apps/api/src/companies/companies.controller.ts`
- Create: `apps/api/src/companies/companies.service.ts`
- Create: `apps/api/src/companies/dto/create-company.dto.ts`
- Create: `apps/api/src/companies/dto/update-company.dto.ts`
- Create: `apps/api/src/companies/companies.e2e-spec.ts`
- Create: `apps/api/src/job-sources/job-sources.module.ts`
- Create: `apps/api/src/job-sources/job-sources.controller.ts`
- Create: `apps/api/src/job-sources/job-sources.service.ts`
- Create: `apps/api/src/job-sources/dto/create-job-source.dto.ts`
- Create: `apps/api/src/job-sources/dto/update-job-source.dto.ts`
- Create: `apps/api/src/job-sources/job-sources.e2e-spec.ts`
- Test: `apps/api/src/companies/companies.e2e-spec.ts`
- Test: `apps/api/src/job-sources/job-sources.e2e-spec.ts`

- [ ] **Step 1: Write the failing catalog tests**

```ts
test("POST /api/job-sources creates a source linked to an existing company", async () => {
  await request(server)
    .post("/api/job-sources")
    .send({
      companyId,
      sourceName: "Workday Main",
      sourceType: "workday",
      sourceUrl: "https://example.myworkdayjobs.com/en-US/careers",
      parserKey: "workday",
      crawlStrategy: "html",
      checkIntervalMinutes: 15,
    })
    .expect(201)
    .expect(({ body }) => {
      assert.equal(body.companyId, companyId);
    });
});
```

- [ ] **Step 2: Run the catalog tests to verify failure**

Run: `npm test --workspace @earlycv/api -- src/companies/companies.e2e-spec.ts src/job-sources/job-sources.e2e-spec.ts`
Expected: FAIL because these catalog modules do not exist.

- [ ] **Step 3: Implement company/job-source CRUD with explicit DTO validation**

```ts
async createCompany(dto: CreateCompanyDto) {
  return this.database.company.create({
    data: {
      ...dto,
      normalizedName: normalizeSlug(dto.name),
    },
  });
}

async createJobSource(dto: CreateJobSourceDto) {
  return this.database.jobSource.create({
    data: dto,
    include: { company: true },
  });
}
```

- [ ] **Step 4: Re-run the catalog tests**

Run: `npm test --workspace @earlycv/api -- src/companies/companies.e2e-spec.ts src/job-sources/job-sources.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/companies apps/api/src/job-sources
git commit -m "feat: add company and job source catalog modules"
```

### Task 7: Add canonical job CRUD with `first_seen_at`

**Files:**
- Create: `apps/api/src/jobs/jobs.module.ts`
- Create: `apps/api/src/jobs/jobs.controller.ts`
- Create: `apps/api/src/jobs/jobs.service.ts`
- Create: `apps/api/src/jobs/dto/create-job.dto.ts`
- Create: `apps/api/src/jobs/dto/update-job.dto.ts`
- Create: `apps/api/src/jobs/jobs.e2e-spec.ts`
- Test: `apps/api/src/jobs/jobs.e2e-spec.ts`

- [ ] **Step 1: Write the failing job persistence tests**

```ts
test("POST /api/jobs requires firstSeenAt and stores canonical job fields", async () => {
  await request(server)
    .post("/api/jobs")
    .send({
      companyId,
      jobSourceId,
      sourceJobUrl: "https://careers.earlycv.dev/jobs/123",
      canonicalKey: "earlycv-demo:data-analyst:sp",
      title: "Data Analyst",
      normalizedTitle: "data analyst",
      descriptionRaw: "Raw desc",
      descriptionClean: "Clean desc",
      locationText: "Sao Paulo, BR",
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      status: "active",
    })
    .expect(201)
    .expect(({ body }) => {
      assert.equal(body.canonicalKey, "earlycv-demo:data-analyst:sp");
      assert.equal(body.firstSeenAt !== undefined, true);
    });
});
```

- [ ] **Step 2: Run the job tests to verify failure**

Run: `npm test --workspace @earlycv/api -- src/jobs/jobs.e2e-spec.ts`
Expected: FAIL because the jobs module does not exist.

- [ ] **Step 3: Implement the jobs module and DTO validation**

```ts
@Post()
create(@Body() dto: CreateJobDto) {
  return this.jobsService.create(dto);
}

async create(dto: CreateJobDto) {
  return this.database.job.create({
    data: {
      ...dto,
      firstSeenAt: new Date(dto.firstSeenAt),
      lastSeenAt: new Date(dto.lastSeenAt),
      publishedAtSource: dto.publishedAtSource ? new Date(dto.publishedAtSource) : null,
    },
  });
}
```

- [ ] **Step 4: Re-run the job tests**

Run: `npm test --workspace @earlycv/api -- src/jobs/jobs.e2e-spec.ts`
Expected: PASS, including the `firstSeenAt` requirement.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs
git commit -m "feat: add canonical job persistence module"
```

### Task 8: Wire all modules into the app and verify the full slice

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `specs/backend-core-slice-1.md`
- Test: full workspace verification

- [ ] **Step 1: Update the app module and docs for the new slice**

```ts
@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    InfraModule,
    HealthModule,
    AuthModule,
    ProfilesModule,
    ResumesModule,
    CompaniesModule,
    JobSourcesModule,
    JobsModule,
  ],
})
export class AppModule {}
```

```dotenv
JWT_ACCESS_SECRET=replace-me
JWT_REFRESH_SECRET=replace-me
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=2592000
GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
LINKEDIN_CLIENT_ID=replace-me
LINKEDIN_CLIENT_SECRET=replace-me
LINKEDIN_CALLBACK_URL=http://localhost:4000/api/auth/linkedin/callback
```

- [ ] **Step 2: Run the full backend slice verification**

Run: `npm run generate --workspace @earlycv/database && npm run lint && npm run check && npm run build && npm run test`
Expected: all workspace commands pass with the new schema, auth flows, and CRUD modules.

- [ ] **Step 3: Smoke-test the API health/auth surface locally**

Run: `npm run dev:api`
Expected: API starts successfully with the new modules and env validation.

Run: `curl http://localhost:4000/api/health`
Expected:

```json
{"ok":true,"service":"api"}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.module.ts .env.example README.md specs/backend-core-slice-1.md
git commit -m "feat: complete backend core slice 1"
```

## Self-review

- Spec coverage: the plan covers schema, migrations, seeds, credentials auth, social auth, refresh-token persistence, user-scoped modules, company/job-source/job CRUD, and `first_seen_at` as a required field.
- Placeholder scan: no `TODO`/`TBD` placeholders remain; out-of-scope items stay explicitly out of scope.
- Type consistency: model names and module names are consistent across schema, API modules, and DTO/service/controller references.
