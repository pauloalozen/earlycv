---
name: EarlyCV Project State
description: Current priorities, built modules, and next slice for EarlyCV SaaS
type: project
---

**Current priority (as of 2026-04-04): CV Adaptation MVP** — CLAUDE.md explicitly overrides previous ingestion direction.

The job ingestion crawler slice (Gupy/Greenhouse adapters, capture rules, run metrics) is **paused**. Its design and plan docs exist but are not the active work.

## What's built
- `packages/database`: Prisma schema with User, Resume, Company, JobSource, IngestionRun, Job, ResumeTemplate, AffiliatePartner/Campaign/Code/Attribution/CommissionEvent
- `apps/api`: NestJS with AuthModule, ProfilesModule, ResumesModule, CompaniesModule, JobSourcesModule, JobsModule, admin/superadmin surfaces
- `apps/web`: Next.js App Router with auth, admin, backoffice, vagas pages; still uses mock jobs (`apps/web/src/lib/jobs.ts`)
- `packages/ai`: exists (index.ts, types.ts) — needs wiring for CV adaptation
- `packages/storage`: exists (index.ts, types.ts) — for PDF upload/storage

## What's NOT built yet (CV Adaptation slice)
- `CvAdaptation` Prisma model (cvFileUrl, jobDescription, adaptedContent, status, paidAt)
- `cv-adaptation` NestJS module with POST /cv-adaptation/analyze
- AI integration for CV analysis/rewrite in `packages/ai`
- Checkout endpoint (Mercado Pago or Stripe)
- Frontend: upload page, result page (with payment gate), checkout/confirmation

## Key invariants
- Never fabricate career facts (experiences, titles, results, certifications, technologies)
- `firstSeenAt` immutable after first job acceptance
- `canonicalKey` deterministically derived from remote job identity
- `apps/web` only talks to `apps/api`

**Why:** CLAUDE.md updated to refocus on core product value (CV adaptation) before ingestion. Ingestion is second wave.
**How to apply:** Start with CvAdaptation schema, then API module, then frontend flow.

## Plan docs (CV adaptation)
- Spec: `docs/superpowers/specs/2026-04-04-cv-adaptation-design.md`
- Implementation plan (13 tasks, TDD): `docs/superpowers/plans/2026-04-04-cv-adaptation-implementation.md`
