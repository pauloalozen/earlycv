# Admin Fase 1 Operacional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Phase 1 operational admin with a unified shell, operational overview, companies, job sources, runs, pending items, and continuity from company creation to first ingestion run.

**Architecture:** The web app gets a shared admin shell and a derived operations layer that combines existing API resources into company states, pending items, and overview metrics. The API gains only the missing read surface for global ingestion runs; everything else reuses the current authenticated CRUD and manual ingestion contracts.

**Tech Stack:** Next.js App Router, server components, server actions, NestJS, Prisma, TypeScript, Tailwind CSS v4

---

- Add a derived operations helper with tests for company state, pending items, and overview counts.
- Add global ingestion run list/detail endpoints to support `/admin/runs`.
- Add the shared `/admin` shell and Phase 1 module routes.
- Reuse existing ingestion routes as compat aliases while making `/admin/fontes` the primary module.
- Verify with targeted tests plus full `check` and `build`.
