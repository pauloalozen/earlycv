# Admin Users + Superadmin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build operational admin management for product users, profiles, resumes, resume templates, and a separate superadmin area for internal staff accounts and privileged support actions.

**Architecture:** Extend the existing auth/database model with explicit internal roles, resume/template distinctions, and administrative endpoints separate from the self-service APIs. Keep `/admin` focused on product-user maintenance, add `/superadmin` as a separate privileged shell, and implement lightweight assisted impersonation with explicit session signaling.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Tailwind CSS v4, Biome, tsx tests

---

## File Structure Map

### Database and shared model

- Modify: `packages/database/prisma/schema.prisma`
  - add internal role fields and staff-account semantics on `User`
  - add `ResumeKind` / master-vs-adapted structure on `Resume`
  - add `ResumeTemplate`
  - add impersonation-support fields if needed for explicit assisted sessions
- Create: `packages/database/prisma/migrations/<timestamp>_add_admin_superadmin_resume_templates/migration.sql`
- Modify: `packages/database/src/schema.spec.ts`

### API auth/authorization

- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/common/jwt-auth.guard.ts`
- Create: `apps/api/src/common/roles.decorator.ts`
- Create: `apps/api/src/common/roles.guard.ts`
- Create: `apps/api/src/common/admin-user.decorator.ts`
- Create: `apps/api/src/auth/dto/create-staff-user.dto.ts`
- Modify: `apps/api/src/app.module.ts`

### API admin domain

- Create: `apps/api/src/admin-users/admin-users.module.ts`
- Create: `apps/api/src/admin-users/admin-users.controller.ts`
- Create: `apps/api/src/admin-users/admin-users.service.ts`
- Create: `apps/api/src/admin-users/admin-users.e2e-spec.ts`
- Create: `apps/api/src/admin-users/dto/update-admin-user.dto.ts`
- Create: `apps/api/src/admin-users/dto/update-admin-user-plan.dto.ts`
- Create: `apps/api/src/admin-users/dto/update-admin-user-status.dto.ts`
- Create: `apps/api/src/admin-users/dto/start-assisted-session.dto.ts`

- Create: `apps/api/src/admin-profiles/admin-profiles.module.ts`
- Create: `apps/api/src/admin-profiles/admin-profiles.controller.ts`
- Create: `apps/api/src/admin-profiles/admin-profiles.service.ts`
- Create: `apps/api/src/admin-profiles/admin-profiles.e2e-spec.ts`

- Create: `apps/api/src/admin-resumes/admin-resumes.module.ts`
- Create: `apps/api/src/admin-resumes/admin-resumes.controller.ts`
- Create: `apps/api/src/admin-resumes/admin-resumes.service.ts`
- Create: `apps/api/src/admin-resumes/admin-resumes.e2e-spec.ts`
- Create: `apps/api/src/admin-resumes/dto/update-admin-resume.dto.ts`
- Create: `apps/api/src/admin-resumes/dto/set-master-resume.dto.ts`

- Create: `apps/api/src/resume-templates/resume-templates.module.ts`
- Create: `apps/api/src/resume-templates/resume-templates.controller.ts`
- Create: `apps/api/src/resume-templates/resume-templates.service.ts`
- Create: `apps/api/src/resume-templates/resume-templates.e2e-spec.ts`
- Create: `apps/api/src/resume-templates/dto/create-resume-template.dto.ts`
- Create: `apps/api/src/resume-templates/dto/update-resume-template.dto.ts`

- Create: `apps/api/src/superadmin-staff/superadmin-staff.module.ts`
- Create: `apps/api/src/superadmin-staff/superadmin-staff.controller.ts`
- Create: `apps/api/src/superadmin-staff/superadmin-staff.service.ts`
- Create: `apps/api/src/superadmin-staff/superadmin-staff.e2e-spec.ts`

### Web admin and superadmin

- Modify: `apps/web/src/app/admin/_components/admin-sidebar.tsx`
- Create: `apps/web/src/app/superadmin/layout.tsx`
- Create: `apps/web/src/app/superadmin/page.tsx`
- Create: `apps/web/src/app/superadmin/_components/superadmin-sidebar.tsx`
- Create: `apps/web/src/app/superadmin/equipe/page.tsx`
- Create: `apps/web/src/app/superadmin/equipe/[id]/page.tsx`
- Create: `apps/web/src/app/superadmin/configuracoes/page.tsx`
- Create: `apps/web/src/app/superadmin/correcoes/page.tsx`
- Create: `apps/web/src/app/superadmin/suporte/page.tsx`

- Modify: `apps/web/src/app/admin/usuarios/page.tsx`
- Create: `apps/web/src/app/admin/usuarios/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/perfis/page.tsx`
- Create: `apps/web/src/app/admin/perfis/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/curriculos/page.tsx`
- Create: `apps/web/src/app/admin/curriculos/[id]/page.tsx`

- Create: `apps/web/src/lib/admin-users-api.ts`
- Create: `apps/web/src/lib/admin-users-operations.ts`
- Create: `apps/web/src/lib/admin-users-operations.spec.ts`
- Create: `apps/web/src/lib/superadmin-api.ts`
- Modify: `apps/web/src/lib/admin-phase-one-data.ts`
- Modify: `apps/web/src/lib/admin-operations.ts`
- Modify: `apps/web/src/lib/admin-operations.spec.ts`

### Docs

- Modify: `README.md`

---

### Task 1: Add roles, staff, master resumes, and templates to Prisma

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_admin_superadmin_resume_templates/migration.sql`
- Test: `packages/database/src/schema.spec.ts`

- [ ] **Step 1: Write the failing schema tests**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

test("schema includes internal admin roles and resume templates", () => {
  assert.match(schema, /enum InternalRole/);
  assert.match(schema, /model ResumeTemplate/);
  assert.match(schema, /enum ResumeKind/);
  assert.match(schema, /master/);
  assert.match(schema, /adapted/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/database -- src/schema.spec.ts`
Expected: FAIL because `InternalRole`, `ResumeTemplate`, and `ResumeKind` do not exist yet.

- [ ] **Step 3: Add the minimal schema changes**

```prisma
enum InternalRole {
  none
  admin
  superadmin
}

enum ResumeKind {
  master
  adapted
}

model User {
  id           String       @id @default(cuid())
  email        String       @unique
  name         String
  internalRole InternalRole @default(none)
  isStaff      Boolean      @default(false)
  resumes      Resume[]
}

model ResumeTemplate {
  id             String   @id @default(cuid())
  name           String
  slug           String   @unique
  description    String?
  targetRole     String?
  fileUrl        String?
  structureJson  Json?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Resume {
  id               String      @id @default(cuid())
  userId           String
  kind             ResumeKind  @default(master)
  basedOnResumeId  String?
  templateId       String?
  targetJobTitle   String?
  targetJobId      String?
  isMaster         Boolean     @default(false)
  user             User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  basedOnResume    Resume?     @relation("ResumeDerivation", fields: [basedOnResumeId], references: [id])
  derivedResumes   Resume[]    @relation("ResumeDerivation")
  template         ResumeTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)

  @@index([userId, kind])
}
```

- [ ] **Step 4: Add the migration SQL**

```sql
CREATE TYPE "InternalRole" AS ENUM ('none', 'admin', 'superadmin');
CREATE TYPE "ResumeKind" AS ENUM ('master', 'adapted');

ALTER TABLE "User"
  ADD COLUMN "internalRole" "InternalRole" NOT NULL DEFAULT 'none',
  ADD COLUMN "isStaff" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Resume"
  ADD COLUMN "kind" "ResumeKind" NOT NULL DEFAULT 'master',
  ADD COLUMN "basedOnResumeId" TEXT,
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "targetJobTitle" TEXT,
  ADD COLUMN "targetJobId" TEXT,
  ADD COLUMN "isMaster" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ResumeTemplate" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "targetRole" TEXT,
  "fileUrl" TEXT,
  "structureJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 5: Run Prisma generate and the schema test**

Run: `npm run generate --workspace @earlycv/database && npm run test --workspace @earlycv/database -- src/schema.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations packages/database/src/schema.spec.ts
git commit -m "feat: add admin roles and resume template schema"
```

### Task 2: Add backend roles and authorization guards

**Files:**
- Create: `apps/api/src/common/roles.decorator.ts`
- Create: `apps/api/src/common/roles.guard.ts`
- Modify: `apps/api/src/common/jwt-auth.guard.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.e2e-spec.ts`

- [ ] **Step 1: Write the failing auth authorization test**

```ts
test("admin-only endpoint rejects product users", async () => {
  const token = await issueUserToken(app, { internalRole: "none", isStaff: false });

  await request(app.getHttpServer())
    .get("/admin/users")
    .set("Authorization", `Bearer ${token}`)
    .expect(403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/auth/auth.e2e-spec.ts`
Expected: FAIL because admin-only authorization does not exist.

- [ ] **Step 3: Add role metadata and guard**

```ts
import { SetMetadata } from "@nestjs/common";

export const INTERNAL_ROLES_KEY = "internal_roles";
export const InternalRoles = (...roles: Array<"admin" | "superadmin">) =>
  SetMetadata(INTERNAL_ROLES_KEY, roles);
```

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

@Injectable()
export class InternalRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<Array<"admin" | "superadmin">>(
      INTERNAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.isStaff || !requiredRoles.includes(user.internalRole)) {
      throw new ForbiddenException("insufficient internal role");
    }

    return true;
  }
}
```

- [ ] **Step 4: Extend the JWT user payload surfaced by auth**

```ts
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  planType: string;
  status: string;
  isStaff: boolean;
  internalRole: "none" | "admin" | "superadmin";
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
```

- [ ] **Step 5: Re-run the auth test**

Run: `npm run test --workspace @earlycv/api -- src/auth/auth.e2e-spec.ts`
Expected: PASS with admin-only routes rejecting non-staff users.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.e2e-spec.ts
git commit -m "feat: add internal role authorization"
```

### Task 3: Add admin user maintenance APIs

**Files:**
- Create: `apps/api/src/admin-users/admin-users.module.ts`
- Create: `apps/api/src/admin-users/admin-users.controller.ts`
- Create: `apps/api/src/admin-users/admin-users.service.ts`
- Create: `apps/api/src/admin-users/admin-users.e2e-spec.ts`
- Create: `apps/api/src/admin-users/dto/update-admin-user.dto.ts`
- Create: `apps/api/src/admin-users/dto/update-admin-user-plan.dto.ts`
- Create: `apps/api/src/admin-users/dto/update-admin-user-status.dto.ts`

- [ ] **Step 1: Write the failing admin user e2e tests**

```ts
test("admin can list product users and patch plan/status", async () => {
  const adminToken = await issueStaffToken(app, { internalRole: "admin" });

  const listResponse = await request(app.getHttpServer())
    .get("/admin/users")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);

  const userId = listResponse.body[0].id;

  await request(app.getHttpServer())
    .patch(`/admin/users/${userId}/plan`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ planType: "free" })
    .expect(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/admin-users/admin-users.e2e-spec.ts`
Expected: FAIL because the module and routes do not exist.

- [ ] **Step 3: Add the admin user service and controller**

```ts
@UseGuards(JwtAuthGuard, InternalRolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list() {
    return this.adminUsersService.listProductUsers();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.adminUsersService.getProductUserById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminUsersService.updateUser(id, dto);
  }

  @Patch(":id/plan")
  updatePlan(@Param("id") id: string, @Body() dto: UpdateAdminUserPlanDto) {
    return this.adminUsersService.updatePlan(id, dto.planType);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateAdminUserStatusDto) {
    return this.adminUsersService.updateStatus(id, dto.status);
  }
}
```

- [ ] **Step 4: Implement list/detail shape with profile/resume summary**

```ts
return this.database.user.findMany({
  where: { isStaff: false },
  include: {
    profile: true,
    resumes: {
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        kind: true,
        isMaster: true,
      },
    },
  },
  orderBy: { createdAt: "desc" },
});
```

- [ ] **Step 5: Re-run the e2e test**

Run: `npm run test --workspace @earlycv/api -- src/admin-users/admin-users.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin-users apps/api/src/app.module.ts
git commit -m "feat: add admin user maintenance api"
```

### Task 4: Add admin profile and resume maintenance APIs

**Files:**
- Create: `apps/api/src/admin-profiles/*`
- Create: `apps/api/src/admin-resumes/*`
- Test: `apps/api/src/admin-profiles/admin-profiles.e2e-spec.ts`
- Test: `apps/api/src/admin-resumes/admin-resumes.e2e-spec.ts`

- [ ] **Step 1: Write the failing profile and resume admin tests**

```ts
test("admin can update another user's profile", async () => {
  const adminToken = await issueStaffToken(app, { internalRole: "admin" });

  await request(app.getHttpServer())
    .patch(`/admin/profiles/${profileId}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ headline: "Senior Data Analyst" })
    .expect(200);
});

test("admin can mark a resume as master", async () => {
  const adminToken = await issueStaffToken(app, { internalRole: "admin" });

  await request(app.getHttpServer())
    .post(`/admin/resumes/${resumeId}/set-master`)
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @earlycv/api -- src/admin-profiles/admin-profiles.e2e-spec.ts src/admin-resumes/admin-resumes.e2e-spec.ts`
Expected: FAIL because the admin routes do not exist.

- [ ] **Step 3: Add admin profile endpoints**

```ts
@UseGuards(JwtAuthGuard, InternalRolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/profiles")
export class AdminProfilesController {
  @Get()
  list() {}

  @Get(":id")
  getById(@Param("id") id: string) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProfileDto) {}
}
```

- [ ] **Step 4: Add admin resume endpoints with master/adapted distinction**

```ts
@UseGuards(JwtAuthGuard, InternalRolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/resumes")
export class AdminResumesController {
  @Get()
  list() {}

  @Get(":id")
  getById(@Param("id") id: string) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAdminResumeDto) {}

  @Post(":id/set-master")
  setMaster(@Param("id") id: string) {
    return this.adminResumesService.setMaster(id);
  }
}
```

- [ ] **Step 5: Re-run the tests**

Run: `npm run test --workspace @earlycv/api -- src/admin-profiles/admin-profiles.e2e-spec.ts src/admin-resumes/admin-resumes.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin-profiles apps/api/src/admin-resumes apps/api/src/app.module.ts
git commit -m "feat: add admin profile and resume maintenance api"
```

### Task 5: Add resume template management and superadmin staff APIs

**Files:**
- Create: `apps/api/src/resume-templates/*`
- Create: `apps/api/src/superadmin-staff/*`
- Create: `apps/api/src/auth/dto/create-staff-user.dto.ts`
- Test: `apps/api/src/resume-templates/resume-templates.e2e-spec.ts`
- Test: `apps/api/src/superadmin-staff/superadmin-staff.e2e-spec.ts`

- [ ] **Step 1: Write the failing template and staff tests**

```ts
test("admin can create a resume template", async () => {
  const adminToken = await issueStaffToken(app, { internalRole: "admin" });

  await request(app.getHttpServer())
    .post("/admin/resume-templates")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "Data CV", slug: "data-cv", isActive: true })
    .expect(201);
});

test("only superadmin can create a staff account", async () => {
  const superadminToken = await issueStaffToken(app, { internalRole: "superadmin" });

  await request(app.getHttpServer())
    .post("/superadmin/staff")
    .set("Authorization", `Bearer ${superadminToken}`)
    .send({ email: "ops@earlycv.dev", name: "Ops", internalRole: "admin" })
    .expect(201);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @earlycv/api -- src/resume-templates/resume-templates.e2e-spec.ts src/superadmin-staff/superadmin-staff.e2e-spec.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Add the resume template endpoints**

```ts
@UseGuards(JwtAuthGuard, InternalRolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/resume-templates")
export class ResumeTemplatesController {
  @Get()
  list() {}

  @Post()
  create(@Body() dto: CreateResumeTemplateDto) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateResumeTemplateDto) {}

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: { isActive: boolean }) {}
}
```

- [ ] **Step 4: Add the superadmin staff endpoints**

```ts
@UseGuards(JwtAuthGuard, InternalRolesGuard)
@InternalRoles("superadmin")
@Controller("superadmin/staff")
export class SuperadminStaffController {
  @Get()
  list() {}

  @Post()
  create(@Body() dto: CreateStaffUserDto) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAdminUserDto) {}

  @Patch(":id/role")
  updateRole(@Param("id") id: string, @Body() dto: { internalRole: "admin" | "superadmin" }) {}
}
```

- [ ] **Step 5: Re-run the tests**

Run: `npm run test --workspace @earlycv/api -- src/resume-templates/resume-templates.e2e-spec.ts src/superadmin-staff/superadmin-staff.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/resume-templates apps/api/src/superadmin-staff apps/api/src/auth/dto/create-staff-user.dto.ts apps/api/src/app.module.ts
git commit -m "feat: add staff and resume template administration"
```

### Task 6: Add assisted impersonation-lite backend flow

**Files:**
- Modify: `apps/api/src/admin-users/admin-users.controller.ts`
- Modify: `apps/api/src/admin-users/admin-users.service.ts`
- Create: `apps/api/src/admin-users/dto/start-assisted-session.dto.ts`
- Modify: `apps/api/src/admin-users/admin-users.e2e-spec.ts`

- [ ] **Step 1: Write the failing assisted-session test**

```ts
test("admin can start an assisted inspection session with explicit metadata", async () => {
  const adminToken = await issueStaffToken(app, { internalRole: "admin" });

  const response = await request(app.getHttpServer())
    .post(`/admin/users/${userId}/assisted-session`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ reason: "debug onboarding" })
    .expect(201);

  assert.equal(response.body.mode, "assisted");
  assert.equal(response.body.targetUserId, userId);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/admin-users/admin-users.e2e-spec.ts`
Expected: FAIL because the endpoint does not exist.

- [ ] **Step 3: Add the assisted-session endpoint**

```ts
@Post(":id/assisted-session")
@HttpCode(201)
startAssistedSession(
  @Param("id") id: string,
  @AuthenticatedUser() operator: AuthenticatedRequestUser,
  @Body() dto: StartAssistedSessionDto,
) {
  return this.adminUsersService.startAssistedSession({
    operatorUserId: operator.id,
    targetUserId: id,
    reason: dto.reason,
  });
}
```

- [ ] **Step 4: Return explicit assisted-session payload**

```ts
return {
  mode: "assisted",
  operatorUserId: input.operatorUserId,
  targetUserId: input.targetUserId,
  reason: input.reason,
  banner: "Sessao assistida ativa",
};
```

- [ ] **Step 5: Re-run the admin users test**

Run: `npm run test --workspace @earlycv/api -- src/admin-users/admin-users.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin-users
git commit -m "feat: add assisted user inspection sessions"
```

### Task 7: Add admin web data clients and derived operations

**Files:**
- Create: `apps/web/src/lib/admin-users-api.ts`
- Create: `apps/web/src/lib/admin-users-operations.ts`
- Create: `apps/web/src/lib/admin-users-operations.spec.ts`
- Modify: `apps/web/src/lib/admin-phase-one-data.ts`
- Modify: `apps/web/src/lib/admin-operations.ts`
- Modify: `apps/web/src/lib/admin-operations.spec.ts`

- [ ] **Step 1: Write the failing web helper test**

```ts
test("buildUserCompletenessStatus marks missing master resume as pending", () => {
  assert.deepEqual(
    buildUserCompletenessStatus({
      hasProfile: true,
      hasMasterResume: false,
    }),
    { label: "sem cv master", tone: "warning" },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/lib/admin-users-operations.spec.ts`
Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Add API helpers for admin and superadmin surfaces**

```ts
export async function listAdminUsers(token: string) {
  return apiRequest<AdminUserRecord[]>("/admin/users", token);
}

export async function listResumeTemplates(token: string) {
  return apiRequest<ResumeTemplateRecord[]>("/admin/resume-templates", token);
}

export async function listStaffUsers(token: string) {
  return apiRequest<StaffUserRecord[]>("/superadmin/staff", token);
}
```

- [ ] **Step 4: Add derived completeness helpers**

```ts
export function buildUserCompletenessStatus(input: {
  hasProfile: boolean;
  hasMasterResume: boolean;
}) {
  if (!input.hasProfile) {
    return { label: "sem perfil", tone: "warning" } as const;
  }

  if (!input.hasMasterResume) {
    return { label: "sem cv master", tone: "warning" } as const;
  }

  return { label: "completo", tone: "success" } as const;
}
```

- [ ] **Step 5: Re-run the web tests**

Run: `npx tsx --test apps/web/src/lib/admin-users-operations.spec.ts apps/web/src/lib/admin-operations.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/admin-users-api.ts apps/web/src/lib/admin-users-operations.ts apps/web/src/lib/admin-users-operations.spec.ts apps/web/src/lib/admin-phase-one-data.ts apps/web/src/lib/admin-operations.ts apps/web/src/lib/admin-operations.spec.ts
git commit -m "feat: add admin user web data helpers"
```

### Task 8: Replace admin placeholders with user/profile/resume modules

**Files:**
- Modify: `apps/web/src/app/admin/usuarios/page.tsx`
- Create: `apps/web/src/app/admin/usuarios/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/perfis/page.tsx`
- Create: `apps/web/src/app/admin/perfis/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/curriculos/page.tsx`
- Create: `apps/web/src/app/admin/curriculos/[id]/page.tsx`

- [ ] **Step 1: Write a failing smoke test for one admin helper path**

```ts
test("filterAdminUsers finds suspended users by email", () => {
  const filtered = filterAdminUsers(
    [{ id: "usr_1", email: "ana@site.dev", status: "suspended" }],
    { query: "ana", status: "suspended" },
  );

  assert.equal(filtered.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/lib/admin-users-operations.spec.ts`
Expected: FAIL because the filter helper does not exist yet.

- [ ] **Step 3: Implement `/admin/usuarios`**

```tsx
export default async function AdminUsersPage({ searchParams }: Props) {
  const { token, query, status } = await searchParams;
  const users = await listAdminUsers(token!);
  const filteredUsers = filterAdminUsers(users, { query, status });

  return (
    <div className="px-6 py-10 md:px-10">
      <AdminShellHeader
        eyebrow="admin / usuarios"
        title="Usuarios"
        subtitle="Manutencao operacional das contas do produto."
      />
      {/* table/cards here */}
    </div>
  );
}
```

- [ ] **Step 4: Implement `/admin/curriculos` with master/adapted distinction**

```tsx
<p className="text-sm text-stone-600">
  {resume.kind === "master" ? "CV master" : "CV adaptado"}
</p>
{resume.template ? <p>Template: {resume.template.name}</p> : null}
```

- [ ] **Step 5: Re-run the targeted web tests**

Run: `npx tsx --test apps/web/src/lib/admin-users-operations.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/usuarios apps/web/src/app/admin/perfis apps/web/src/app/admin/curriculos apps/web/src/lib/admin-users-operations.spec.ts
git commit -m "feat: add admin user profile and resume screens"
```

### Task 9: Add superadmin shell and internal staff/template screens

**Files:**
- Create: `apps/web/src/app/superadmin/layout.tsx`
- Create: `apps/web/src/app/superadmin/page.tsx`
- Create: `apps/web/src/app/superadmin/_components/superadmin-sidebar.tsx`
- Create: `apps/web/src/app/superadmin/equipe/page.tsx`
- Create: `apps/web/src/app/superadmin/equipe/[id]/page.tsx`
- Create: `apps/web/src/app/superadmin/configuracoes/page.tsx`
- Create: `apps/web/src/app/superadmin/correcoes/page.tsx`
- Create: `apps/web/src/app/superadmin/suporte/page.tsx`
- Modify: `apps/web/src/app/admin/_components/admin-sidebar.tsx`

- [ ] **Step 1: Write the failing sidebar helper test**

```ts
test("superadmin nav items include equipe and suporte", () => {
  assert.deepEqual(getSuperadminNavLabels(), [
    "Visao geral",
    "Equipe",
    "Configuracoes",
    "Correcoes",
    "Suporte",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/lib/admin-users-operations.spec.ts`
Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Add the superadmin shell**

```tsx
export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SuperadminSidebar />
      <main className="lg:pl-72">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Add the initial superadmin screens**

```tsx
export default async function SuperadminTeamPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const staffUsers = await listStaffUsers(token!);

  return (
    <div className="px-6 py-10 md:px-10">
      <h1 className="text-3xl font-bold tracking-tight">Equipe interna</h1>
      {/* staff cards/table */}
    </div>
  );
}
```

- [ ] **Step 5: Re-run the targeted web tests**

Run: `npx tsx --test apps/web/src/lib/admin-users-operations.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/superadmin apps/web/src/app/admin/_components/admin-sidebar.tsx apps/web/src/lib/admin-users-operations.spec.ts
git commit -m "feat: add superadmin shell and staff screens"
```

### Task 10: Add assisted-session UI and new pending items

**Files:**
- Modify: `apps/web/src/app/admin/usuarios/[id]/page.tsx`
- Modify: `apps/web/src/lib/admin-operations.ts`
- Modify: `apps/web/src/lib/admin-operations.spec.ts`
- Modify: `apps/web/src/lib/admin-phase-one-data.ts`
- Modify: `apps/web/src/app/admin/page.tsx`
- Modify: `apps/web/src/app/admin/pendencias/page.tsx`

- [ ] **Step 1: Write the failing pending derivation test**

```ts
test("buildPendingItems adds missing master resume pending", () => {
  const pendingItems = buildPendingItems({
    companies: [],
    jobSources: [],
    token: "abc",
    adminUsers: [
      { id: "usr_1", name: "Ana", hasProfile: true, hasMasterResume: false },
    ],
  });

  assert.equal(
    pendingItems.some((item) => item.type === "user-missing-master-resume"),
    true,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/lib/admin-operations.spec.ts`
Expected: FAIL because admin-user pending derivation does not exist.

- [ ] **Step 3: Extend pending derivation and overview metrics**

```ts
if (adminUser.hasProfile && !adminUser.hasMasterResume) {
  items.push({
    type: "user-missing-master-resume",
    entityId: adminUser.id,
    title: adminUser.name,
    description: "Conta sem CV master definido.",
    priority: "alta",
    cta: "Revisar curriculos",
    href: `/admin/usuarios/${adminUser.id}?token=${encodeURIComponent(token)}`,
  });
}
```

- [ ] **Step 4: Add assisted-session banner in the user detail page**

```tsx
{assistedSession ? (
  <Card className="border-orange-300 bg-orange-50" padding="sm">
    <p className="font-semibold text-orange-900">Sessao assistida ativa</p>
    <p className="text-sm text-orange-800">Voce esta inspecionando esta conta em modo assistido.</p>
  </Card>
) : null}
```

- [ ] **Step 5: Re-run the web tests**

Run: `npx tsx --test apps/web/src/lib/admin-operations.spec.ts apps/web/src/lib/admin-users-operations.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/usuarios/[id]/page.tsx apps/web/src/lib/admin-operations.ts apps/web/src/lib/admin-operations.spec.ts apps/web/src/lib/admin-phase-one-data.ts apps/web/src/app/admin/page.tsx apps/web/src/app/admin/pendencias/page.tsx
git commit -m "feat: add user completeness pending states"
```

### Task 11: Final verification and docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README with the new admin and superadmin surfaces**

```md
- `/admin` agora cobre usuarios, perfis, curriculos e pendencias de completude
- `/superadmin` cobre equipe interna, configuracoes sensiveis, correcoes e suporte
- curriculos suportam `CV master`, curriculos adaptados e templates de CV otimizados
```

- [ ] **Step 2: Run targeted API tests**

Run: `npm run test --workspace @earlycv/api -- src/auth/auth.e2e-spec.ts src/admin-users/admin-users.e2e-spec.ts src/admin-profiles/admin-profiles.e2e-spec.ts src/admin-resumes/admin-resumes.e2e-spec.ts src/resume-templates/resume-templates.e2e-spec.ts src/superadmin-staff/superadmin-staff.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 3: Run targeted web tests**

Run: `npx tsx --test apps/web/src/lib/admin-operations.spec.ts apps/web/src/lib/admin-users-operations.spec.ts`
Expected: PASS.

- [ ] **Step 4: Run repo verification**

Run: `npm run check && npm run generate --workspace @earlycv/database && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: record admin and superadmin operations"
```

## Self-Review

- Spec coverage: this plan covers internal roles/staff, admin user/profile/resume maintenance, resume templates, assisted sessions, admin pending integration, and the new `/superadmin` area.
- Placeholder scan: no `TBD`, `TODO`, or deferred "implement later" steps remain in the tasks.
- Type consistency: the plan consistently uses `InternalRole`, `ResumeKind`, `ResumeTemplate`, `isStaff`, `internalRole`, and `isMaster` across schema, API, and web tasks.
