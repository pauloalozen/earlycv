---
name: EarlyCV Project State
description: Current priorities, built modules, and next slice for EarlyCV SaaS
type: project
---

**Current priority (as of 2026-04-23): CV Adaptation hardening + quality gates.**

The ingestion roadmap still exists, but current execution is focused on correctness/safety in CV adaptation and paid delivery flows.

## What's built
- `packages/database`: Prisma schema with User, Resume, Company, JobSource, IngestionRun, Job, ResumeTemplate, AffiliatePartner/Campaign/Code/Attribution/CommissionEvent
- `apps/api`: NestJS with AuthModule, ProfilesModule, ResumesModule, CompaniesModule, JobSourcesModule, JobsModule, admin/superadmin surfaces
- `apps/web`: Next.js App Router with auth, admin, backoffice, vagas pages; still uses mock jobs (`apps/web/src/lib/jobs.ts`)
- `packages/ai`: integrated into CV adaptation analysis flows
- `packages/storage`: active in API flows for template and resume file storage

## Current hardening status (CV Adaptation)
- `cv-adaptation` module is live with guest/auth analysis, payment gating, and download (PDF/DOCX)
- Protection boundary + observability are integrated and covered by tests
- Regression guard added: adapted CV must never auto-become master resume
- `saveAsMaster` now controls promotion explicitly; when true, promoted resume must be the uploaded source CV
- Resume source file persistence/download supports original binary files (PDF/DOC/DOCX), with text fallback only for legacy records

## Key invariants
- Never fabricate career facts (experiences, titles, results, certifications, technologies)
- Adapted resume (`kind=adapted`) must never be promoted to master automatically
- Uploaded source resume is the only eligible record for `isMaster=true` in adaptation save flows
- `firstSeenAt` immutable after first job acceptance
- `canonicalKey` deterministically derived from remote job identity
- `apps/web` only talks to `apps/api`

**Why:** Product trust depends on strict factual traceability and explicit user intent for master CV management.
**How to apply:** Keep adding e2e/unit regressions first for CV adaptation flows, then evolve ingestion slice without regressing adaptation guarantees.

## Plan docs (CV adaptation)
- Spec: `docs/superpowers/specs/2026-04-04-cv-adaptation-design.md`
- Implementation plan (13 tasks, TDD): `docs/superpowers/plans/2026-04-04-cv-adaptation-implementation.md`
