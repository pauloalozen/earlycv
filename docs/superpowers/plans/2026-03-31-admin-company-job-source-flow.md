# Admin Company + Job Source Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins create a company and its first job source from the internal ingestion panel without using Insomnia.

**Architecture:** Keep the backend contract unchanged and orchestrate the existing `POST /companies` and `POST /job-sources` endpoints from a two-step admin flow in the web app. The admin panel gets a dedicated creation route, server actions for step 1 and step 2, and redirects back into the ingestion list ready to run manual ingestion.

**Tech Stack:** Next.js App Router, server actions, NestJS existing CRUD endpoints, TypeScript, Tailwind CSS v4

---

- Add a dedicated admin route for the wizard.
- Add typed web helpers for creating companies and job sources.
- Add minimal failing tests around the new admin helper/action behavior.
- Implement two-step creation UI with clear error/success states.
- Verify with targeted checks and full project checks.
