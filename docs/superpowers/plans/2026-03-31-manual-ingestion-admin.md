# Manual Ingestion Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual job ingestion per `JobSource` with basic run auditing and an internal admin panel to trigger and inspect runs.

**Architecture:** The API gains a synchronous ingestion pipeline that resolves a source adapter, normalizes raw observations into the existing `Job` shape, upserts records while preserving `canonicalKey` and `firstSeenAt`, and persists an `IngestionRun` audit record with counters and preview data. The web app adds a noindex internal admin surface that lists job sources, triggers `Run now`, and shows recent run details via the API.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Tailwind CSS v4, Biome

---

## File Structure

- `packages/database/prisma/schema.prisma` — add `IngestionRun` and enums/JSON preview fields.
- `packages/database/prisma/seed.ts` — ensure seed data supports at least one manual run target.
- `apps/api/src/database/database.service.ts` — expose Prisma delegate for ingestion runs.
- `apps/api/src/ingestion/*` — new ingestion module, adapters, DTOs, tests.
- `apps/api/src/job-sources/*` — enrich list/detail and add `run` endpoints.
- `apps/api/src/jobs/jobs.service.ts` — share or reuse normalization/upsert rules.
- `apps/web/src/app/admin/ingestion/*` — internal admin pages.
- `apps/web/src/lib/api/*` — typed API calls for admin ingestion UI.

## Execution Notes

- Keep TDD discipline for every new behavior.
- Scope stays synchronous; no queue worker in this slice.
- Preserve `Job.canonicalKey` uniqueness and `firstSeenAt` immutability.
- Admin pages must be internal/noindex.
