# EarlyCV Product Context

## Positioning

EarlyCV is a SaaS copilot for job applications in Brazil. The initial focus is on technology, data, product, analytics/BI, and adjacent digital roles where company career portals often publish opportunities before large job boards amplify them.

The product is built for candidates who want a more strategic application workflow: discover relevant jobs early, understand where they truly fit, and adapt their resumes for each application without fabricating their background.

## Proposta Central

EarlyCV creates value through three connected promises:

1. Detect jobs early by monitoring company career portals directly.
2. Score resume-to-job fit with explainability so candidates know why a role is or is not a strong match.
3. Tailor resumes for each application while preserving factual accuracy and traceability.

The product should always reinforce that timing, relevance, and trustworthy customization matter more than generic mass application volume.

## Non-Negotiable Product Rules

- Never invent experiences, job titles, results, certifications, technologies, or responsibilities.
- Resume tailoring must preserve traceability back to source resume facts and user-provided data.
- `first_seen_at` is a core signal, not a peripheral field; it supports ranking, alerting, freshness, and product differentiation.
- Public job pages remain server-rendered and SEO-complete.
- Public job pages should include complete metadata, canonical URLs, Open Graph/Twitter metadata, robots directives, and structured data when applicable.
- Public job detail pages should expose `JobPosting` structured data.
- Internal, utility, admin, and showcase routes should usually be `noindex` unless there is a deliberate SEO reason not to.
- The web app must not bypass the API for business logic or infrastructure access.

## MVP Modules

The MVP covers the following product modules:

### 1. Users and authentication

- Account creation and login.
- User identity and access boundaries for private candidate data.

### 2. Resume upload, parsing, and normalization

- Resume ingestion from user uploads.
- Structured extraction of experience, skills, education, and supporting signals.
- Normalized candidate profile data that downstream matching and tailoring can trust.

### 3. Job sources and crawling

- Connectors and crawlers for company career portals.
- Ingestion pipelines that capture job source metadata and observation timestamps.
- Freshness tracking centered on `first_seen_at`.

### 4. Jobs and deduplication

- Canonical job records assembled from crawled source data.
- Deduplication and normalization across sources or repeated observations.
- Public job pages with stable URLs and SSR output.

### 5. Alerts

- Saved searches or targeting preferences.
- Delivery of early signals when matching jobs appear.

### 6. Matching

- Resume-to-job fit scoring.
- Explainable matching output that highlights strengths, gaps, and uncertainty.

### 7. Tailored resumes

- Resume adaptation support per job application.
- Safe content generation constrained by verified source facts.

### 8. Notifications

- Operational messaging for alerts, workflow updates, and key candidate prompts.

### 9. AI generation audit

- Records of AI-assisted outputs, inputs, and traceability references.
- Audit support for reviewing how tailored content was produced.

## Product Principles

- Prioritize speed-to-signal for relevant jobs, especially from first-party company sources.
- Make fit scoring legible; users should understand the reasoning behind recommendations.
- Preserve candidate trust by making factual boundaries explicit in every resume-tailoring flow.
- Treat SEO as a product surface, not only a marketing concern.
- Favor systems that can expand from the initial Brazil-focused role segments into broader categories later without rewriting core boundaries.

## Architectural Direction

EarlyCV is moving to a monorepo with `apps/web`, `apps/api`, `packages/config`, `packages/database`, `packages/queue`, `packages/storage`, and `packages/ai`.

- `apps/web` serves the product experience, including public SEO pages and authenticated candidate flows.
- `apps/api` owns business rules, data workflows, and orchestration across infrastructure-facing packages.
- Shared packages provide reusable technical capabilities, not product policy.
- SEO-critical public job content must stay server-rendered in the web app while consuming API-owned contracts.

The structural breakdown, package responsibilities, implementation order, and acceptance criteria belong in `specs/foundation-monorepo.md`.

## Expected Data Flow

1. Crawlers ingest jobs from company portals into API-controlled pipelines.
2. The API normalizes and deduplicates job data, preserving source timestamps including `first_seen_at`.
3. The API computes fit, powers alerts, and coordinates resume-tailoring flows.
4. The web app fetches data from the API for both public job experiences and authenticated user workflows.
5. AI-assisted resume outputs are constrained by normalized candidate facts and logged for auditability.

## What Must Stay True During Future Work

- Early discovery remains the product wedge.
- Explainability remains part of matching, not an optional add-on.
- Tailoring quality must never come from inventing resume facts.
- Public job pages remain indexable, rich, and structurally complete.
- Monorepo boundaries should reduce coupling, not move business logic into the web app.
