# Auth Login Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build web login, role-based redirects, and email verification by code with fake email delivery, while replacing manual admin entry with a session-based flow.

**Architecture:** The API remains the source of truth for registration, login, refresh, email verification, and email delivery orchestration. The web app stores auth tokens in HTTP-only cookies, loads session state server-side, and redirects by verification state and internal role. Email delivery is abstracted behind an API service with a fake implementation for tests and local development.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Node test runner, HTTP-only cookies

---

### Task 1: Add verification persistence and fake email delivery in the API

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_email_verification_challenges/migration.sql`
- Create: `apps/api/src/auth/email-delivery.port.ts`
- Create: `apps/api/src/auth/fake-email-delivery.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Test: `packages/database/src/**/*.spec.ts` if schema shape assertions need updates

- [ ] **Step 1: Write the failing schema/test assertions**
- [ ] **Step 2: Run the relevant database/API tests to verify the gap fails for missing verification persistence**
- [ ] **Step 3: Add `EmailVerificationChallenge` schema and fake email delivery provider wiring**
- [ ] **Step 4: Run the touched tests again to confirm the new model/provider wiring is valid**

### Task 2: Add API registration, verify-email, and resend-code behavior

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/dto/verify-email.dto.ts`
- Create: `apps/api/src/auth/dto/resend-verification-code.dto.ts`
- Modify: `apps/api/src/auth/auth.service.spec.ts`
- Modify: `apps/api/src/auth/auth.e2e-spec.ts`

- [ ] **Step 1: Write failing tests for registration creating a challenge and emitting fake delivery**
- [ ] **Step 2: Run those tests and verify they fail for the expected missing verification behavior**
- [ ] **Step 3: Write failing tests for verify-email success, invalid code, expired code, and resend invalidation**
- [ ] **Step 4: Run those tests and verify they fail for the expected missing endpoints/service logic**
- [ ] **Step 5: Implement minimal API changes for challenge generation, hashing, verify, resend, and fake delivery capture**
- [ ] **Step 6: Run the touched auth tests and confirm they pass**

### Task 3: Add server-side web session helpers for auth and verification state

**Files:**
- Create: `apps/web/src/lib/app-session.ts`
- Create: `apps/web/src/lib/app-session.server.ts`
- Create: `apps/web/src/lib/app-session.spec.ts`
- Modify: `apps/web/src/lib/backoffice-session.server.ts` only if a compatibility bridge is needed

- [ ] **Step 1: Write failing tests for destination resolution by `internalRole` and `emailVerifiedAt`**
- [ ] **Step 2: Run the web lib tests and verify they fail for missing session helpers**
- [ ] **Step 3: Implement cookie names, session normalization, redirect helpers, and server-side refresh/me loading**
- [ ] **Step 4: Run the touched web lib tests and confirm they pass**

### Task 4: Add web auth endpoints/actions for login, register, verify, resend, and logout

**Files:**
- Create: `apps/web/src/app/auth/login/route.ts`
- Create: `apps/web/src/app/auth/register/route.ts`
- Create: `apps/web/src/app/auth/verify-email/route.ts`
- Create: `apps/web/src/app/auth/resend-verification/route.ts`
- Create: `apps/web/src/app/auth/logout/route.ts`
- Create: `apps/web/src/lib/auth-api.ts`
- Create: `apps/web/src/lib/auth-api.spec.ts` if helpers need isolation

- [ ] **Step 1: Write failing tests for login/register/verify/resend result mapping and cookie behavior at the helper boundary**
- [ ] **Step 2: Run those tests and verify they fail for missing auth web integration**
- [ ] **Step 3: Implement minimal API client helpers plus route handlers that set/clear cookies and redirect correctly**
- [ ] **Step 4: Run the touched tests and confirm they pass**

### Task 5: Add UI screens and route guarding in the web app

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/verificar-email/page.tsx`
- Create: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/app/admin/page.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx` if shared guard logic belongs there
- Modify: `apps/web/src/app/superadmin/layout.tsx`
- Review: `apps/web/src/components/ui/AGENTS.md` before adding new UI components there if needed

- [ ] **Step 1: Write failing tests for guard decisions covering anonymous, unverified, common-user, admin, and superadmin flows where practical**
- [ ] **Step 2: Run the relevant tests and verify they fail for the expected missing route/UI behavior**
- [ ] **Step 3: Implement the login screen, verification screen, dashboard placeholder, homepage CTA updates, and protected-route redirects**
- [ ] **Step 4: Run the touched tests and confirm they pass**

### Task 6: Verify the end-to-end baseline for touched workspaces

**Files:**
- Verify only

- [ ] **Step 1: Run `npm run test --workspace @earlycv/api`**
- [ ] **Step 2: Run `npm run check --workspace @earlycv/api`**
- [ ] **Step 3: Run `npm run check --workspace @earlycv/web`**
- [ ] **Step 4: Run any web tests added for this feature with the exact command they require**
- [ ] **Step 5: Run `npm test` from the worktree root if workspace coverage remains consistent with the repo baseline**
