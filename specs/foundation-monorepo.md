# EarlyCV Foundation Monorepo Spec

## Scope

This spec defines the approved monorepo foundation for EarlyCV. It establishes the base application split, shared package responsibilities, architectural boundaries, implementation order, and acceptance conditions needed before broader product expansion.

This foundation is intentionally structural. It creates the durable skeleton for future product modules without pulling business logic into the wrong layer.

## Objective

Create a monorepo that supports EarlyCV's MVP and long-term growth while preserving these product truths:

- public jobs are SEO-critical and server-rendered;
- `first_seen_at` is a core signal;
- resume tailoring cannot invent facts;
- the web app must talk only to the API;
- the API owns business rules and infrastructure orchestration.

This document is the structural companion to `specs/product-context.md`: product context defines the why and the product rules, while this spec defines the monorepo shape that implements them.

## Target Architecture

### Applications

- `apps/web`: Next.js web application for public and authenticated UX.
- `apps/api`: backend application bootstrap that already exposes the initial service boundary and shared-package integration points, with `backend-core` responsible for adding product APIs and domain orchestration for jobs, matching, tailoring, alerts, notifications, and audits.

### Shared packages

- `packages/config`: shared config, environment validation, and common toolchain presets.
- `packages/database`: schema, migrations, typed database access, and canonical data contracts tied to persistence.
- `packages/queue`: background jobs, queue adapters, worker contracts, and async workflow helpers.
- `packages/storage`: abstractions for file/object storage, especially resumes and generated artifacts.
- `packages/ai`: provider abstractions, generation helpers, guardrails, and audit-oriented utilities.

## Package Responsibilities

### `apps/web`

- Render landing, product, public job, and authenticated candidate experiences.
- Converge on API-facing contracts; the current foundation still keeps the mock job seam in `apps/web/src/lib/jobs.ts` and `apps/web/src/app/vagas/[slug]/page.tsx` until `backend-core` replaces it.
- Keep public job pages server-rendered with complete metadata and structured data.
- Avoid direct database, queue, storage, or AI access.

### `apps/api`

- Ship the bootstrap application layer that `backend-core` will extend into domain modules for jobs, crawling, matching, tailored resumes, alerts, notifications, and audits.
- Coordinate shared-package integration points now, then grow into the full orchestration layer in `backend-core`.
- Expose the initial contract surface that the web app and later domain modules can build on.
- Remain the owner of product rules like factual traceability and safe generation boundaries as those flows land.

### `packages/config`

- Centralize shared config and environment schemas.
- Prevent config drift across apps and packages.

### `packages/database`

- Prepare the package boundary that will own persistence shape for jobs, candidates, resume facts, alerts, audits, and timestamps including `first_seen_at`; the actual schema/runtime field lands in `backend-core`, not in this foundation slice.
- Contain migrations and reusable typed persistence helpers.

### `packages/queue`

- Support crawl scheduling, job ingestion, fit recomputation, notifications, and other background workflows.
- Define reusable async interfaces without moving product decisions out of the API.

### `packages/storage`

- Store resumes, parsed artifacts, and generated documents.
- Expose storage operations through reusable abstractions.

### `packages/ai`

- Encapsulate provider clients and generation helpers.
- Support structured outputs, provenance hooks, and auditability.
- Never become a hidden location for business rules about candidate truthfulness; those remain API-owned.

## Rules of Boundaries

- `apps/web` cannot talk directly to the database, queue, storage providers, or AI providers.
- `apps/web` cannot own canonical business rules.
- `apps/api` is the intended single orchestrator for business logic and infrastructure composition; this foundation only ships the bootstrap surface that `backend-core` will expand into that role.
- Shared packages may expose primitives and helpers, but not product policy that belongs in the API.
- SEO requirements for public job pages are enforced in web implementation; in this foundation they still run on the existing mock seam, and `backend-core` is responsible for moving that surface to API-provided data.
- Resume tailoring flows must preserve traceability to original candidate facts.
- No system may fabricate experience, titles, responsibilities, achievements, certifications, or technologies.

## Target Data Flow (`backend-core` onward)

1. External job sources are crawled through API-controlled workflows.
2. Raw observations are normalized and deduplicated through API logic backed by `packages/database`.
3. `first_seen_at` is stored and preserved as a first-class signal.
4. Matching, alerts, notifications, and tailoring are initiated by API services and background jobs.
5. `apps/web` requests read/write operations through API contracts only.
6. Public job pages are rendered on the server in `apps/web` using API-backed data and include SEO-complete metadata plus `JobPosting` structured data.
7. AI-assisted tailoring uses verified candidate facts, writes audit records, and does not invent new resume claims.

## Implementation Order

1. Establish monorepo workspace layout with `apps/web`, `apps/api`, and the shared `packages/*` foundation.
2. Centralize shared tooling and environment conventions in `packages/config`.
3. Extract or define persistence concerns in `packages/database`.
4. Introduce API-owned service boundaries that web can consume.
5. Create infrastructure packages for queue, storage, and AI behind reusable interfaces.
6. Preserve and migrate SEO-critical public job rendering so the web app keeps server-rendered job pages with full metadata.
7. Layer MVP modules onto the new structure without violating app/package boundaries.

## Key Decisions

- Use a two-application structure: one web app and one API app.
- Keep business logic centralized in the API instead of splitting it across frontend and shared packages.
- Treat infrastructure concerns as packages, not as ad hoc code inside applications.
- Preserve SEO as a product requirement from the foundation stage.
- Preserve factual traceability as a product rule from the foundation stage.
- Keep `first_seen_at` prominent in storage and downstream product features.

## Risks

- Boundary erosion may occur if the web app starts calling shared infra packages directly for speed.
- SEO regressions may happen if public job rendering moves away from server-rendered, metadata-complete pages.
- Factual safety can degrade if AI helper packages absorb product rules instead of leaving enforcement to the API.
- Data freshness value weakens if `first_seen_at` is treated as optional during ingestion or deduplication.
- Package sprawl may create complexity if responsibilities are not kept narrow and explicit.

## Mitigations

- Enforce clear dependency rules and code review expectations around web-to-API-only communication.
- Model SEO requirements as acceptance criteria for public job routes.
- Encode traceability and audit expectations early in API contracts and AI integration flows.
- Include `first_seen_at` in core schemas, ingestion pipelines, and ranking-oriented contracts from the start.
- Keep shared packages focused on reusable technical capabilities, not product orchestration.

## Acceptance Criteria

- The repository contains workspace entries for `apps/web`, `apps/api`, `packages/config`, `packages/database`, `packages/queue`, `packages/storage`, and `packages/ai`.
- `apps/web` preserves the current public job seam in `apps/web/src/lib/jobs.ts` and `apps/web/src/app/vagas/[slug]/page.tsx`, and does not import runtime code from database, queue, storage, or AI packages.
- `apps/api` contains the bootstrap application layer, shared-package wiring, and extension points that `backend-core` will use to add orchestration for jobs, matching, tailored resumes, alerts, notifications, and audit-related workflows.
- Shared packages expose bounded technical capabilities that match their responsibilities without becoming alternate homes for business rules.
- The foundation establishes package boundaries so `backend-core` can add `first_seen_at` as a required field/invariant in schema, ingestion, and downstream contracts.
- Public job pages in `apps/web` still render on the server from the current mock seam and emit SEO-complete metadata plus `JobPosting` structured data, with the API-backed swap deferred to `backend-core`.
- Internal, utility, and showcase routes default to `noindex` unless they are intentionally exposed as public indexable routes.
- Resume-tailoring flows are still a `backend-core` responsibility; when implemented, generated output must remain traceable to verified candidate facts and must not introduce invented experience, titles, responsibilities, achievements, certifications, or technologies.

## Out of Scope

- Full implementation of each MVP module.
- Final vendor choices for database, queue, storage, or AI providers.
- Detailed API schema design for every domain.
- Detailed infrastructure deployment topology.

## Relationship to Product Context

This foundation spec operationalizes the EarlyCV product context. If future implementation details conflict with the product rules in `specs/product-context.md`, the product rules win.

## Backend-core Handoff

The foundation workspace is now present and verified with these workspaces:

- `apps/web`
- `apps/api`
- `packages/config`
- `packages/database`
- `packages/queue`
- `packages/storage`
- `packages/ai`

### Verified foundation state

- Root verification command set: `npm run lint`, `npm run check`, `npm run build`, `npm run test`, and `npm ls --workspaces --depth=0`.
- Verification should run sequentially because `build`, `test`, and compiled runtime startup still regenerate or depend on fresh shared package output in `packages/*/dist`.
- Shared packages now expose `development` + `types` from `src` while keeping compiled runtime `default` exports in `packages/*/dist`. That lets `apps/api` resolve source contracts directly for `dev`, `check`, `test`, and `build` without relying on prebuilt `dist`; compiled startup paths still use `postinstall`, root `prebuild`, and API `prestart` to refresh shared artifacts before `node dist/main.js` or a full production build runs.
- Root and workspace scripts currently assume a Unix-like shell because the npm scripts use `if [ ... ]`, background jobs, and similar shell constructs.
- `apps/web` currently preserves the public Next.js surface, including the server-rendered public job route and SEO-oriented app metadata files.
- `apps/web` still uses the mock-data seam in `apps/web/src/lib/jobs.ts`, with `apps/web/src/app/vagas/[slug]/page.tsx` acting as the SEO reference surface to preserve during `backend-core`.
- `apps/api` currently exposes bootstrap modules for environment loading, health, and internal infrastructure diagnostics across the shared packages rather than a public diagnostics route.
- Shared packages currently provide scaffolded runtime contracts, types, and basic tests/builds rather than final business implementations.
- `first_seen_at` remains a required upcoming invariant, but this foundation only prepares the package boundaries; the concrete schema/model/runtime representation is deferred to `backend-core`.

### Next phase notes for `backend-core`

- Build domain modules inside `apps/api` for jobs, ingestion, matching, alerts, resume tailoring, and audit flows without moving product rules into shared packages.
- Replace the current mock-data seam in `apps/web/src/lib/jobs.ts` with API-backed read contracts served by `apps/api`, while preserving the exact SEO surface already wired in `apps/web/src/app/vagas/[slug]/page.tsx`.
- Treat `apps/web/src/app/vagas/[slug]/page.tsx` as the reference public-job contract: `generateStaticParams`, `generateMetadata`, and `JobPosting` JSON-LD should keep working after the data source moves behind the API.
- Migrate the current `getJobBySlug` and `jobs` usage in `apps/web/src/lib/jobs.ts` into API/domain modules incrementally so `backend-core` can swap data sources without breaking route generation, canonical URLs, keywords, or structured data.
- Expand `packages/database` from scaffold to canonical schema, migrations, and typed persistence around jobs, candidate facts, audits, and `first_seen_at`.
- Wire `packages/queue`, `packages/storage`, and `packages/ai` into API-owned services so infrastructure remains reusable but orchestration stays in `apps/api`.
- Preserve the non-negotiable product rule that resume adaptation cannot invent facts and keep traceability/audit data explicit in API contracts and persistence.
- Keep public-job SEO guarantees intact while backend contracts mature: server rendering, complete metadata, and `JobPosting` structured data must continue to be supported from API data.
