# EarlyCV Backend Core Slice 1 Spec

## Scope

This spec defines the first executable `backend-core` slice for EarlyCV. It focuses on the initial persistence layer and API surface that future job ingestion, matching, tailoring, and alert workflows will build on.

This slice is intentionally limited to identity, authentication, candidate-owned resume data, company/source catalog foundations, and canonical job storage. It does not implement crawling, matching, tailoring, or notifications yet.

## Objective

Create the first real backend domain layer for EarlyCV with these outcomes:

- users can register, log in, refresh sessions, and fetch `me`;
- authentication works with email/password plus Google and LinkedIn social login;
- the database owns the first canonical schema for users, profiles, resumes, companies, job sources, and jobs;
- the API exposes CRUD and read/write boundaries for those entities;
- job persistence is ready for the next ingestion slice, including `canonical_key`, `first_seen_at`, and status fields.

## Product Rules Preserved In This Slice

- The API remains the owner of business rules and private data access.
- Resume facts remain candidate-owned and must not be fabricated or silently altered.
- `first_seen_at` becomes a first-class persisted invariant in job storage.
- Public SEO job rendering in `apps/web` stays on the current mock seam during this slice; the API-backed swap happens later.
- Shared packages provide technical capabilities; they do not become alternate homes for product policy.

## In Scope

### Database and persistence

- Expand `packages/database` from bootstrap scaffold into the first real Prisma schema.
- Add migrations, generated client updates, and minimal seeds for local development.
- Establish constraints, enums, indexes, and relations for the first core entities.

### Authentication

- Email/password registration and login.
- JWT access token plus refresh token flow.
- `GET /auth/me` protected by JWT.
- Social login via Google and LinkedIn.
- Provider identity linking through a dedicated auth-account relation.
- Refresh-token persistence with server-side hashing and revocation support.

### Domain modules in `apps/api`

- `auth`
- `profiles`
- `resumes`
- `companies`
- `job-sources`
- `jobs`

Current implementation note: a dedicated `users` module was not extracted in this slice. Sanitized current-user payloads stay in the auth/common boundary for now, and that refactor remains optional for a later slice if user-read complexity grows.

### Initial API surface

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/linkedin/start`
- `GET /auth/linkedin/callback`
- `GET /users/profile`
- `PUT /users/profile`
- `POST /resumes`
- `GET /resumes`
- `GET /resumes/:id`
- `PUT /resumes/:id`
- `POST /resumes/:id/set-primary`
- `GET /companies`
- `POST /companies`
- `GET /companies/:id`
- `PUT /companies/:id`
- `GET /job-sources`
- `POST /job-sources`
- `GET /job-sources/:id`
- `PUT /job-sources/:id`
- `GET /jobs`
- `POST /jobs`
- `GET /jobs/:id`
- `PUT /jobs/:id`

## Out of Scope

- Running crawlers against real sources.
- Resume file upload to object storage.
- Resume parsing and normalization pipelines.
- Matching, fit scoring, explanations, and recommendations.
- Tailored-resume generation.
- Alert delivery and notification workflows.
- Replacing the current `apps/web` mock-data seam with API-backed job reads.
- Full RBAC/admin backoffice.

## Target Data Model

### Identity and auth

#### `users`

Core account record.

Suggested fields:
- `id`
- `email`
- `password_hash` nullable for social-only users
- `name`
- `plan_type`
- `status`
- `email_verified_at`
- `last_login_at`
- `created_at`
- `updated_at`

Rules:
- `email` unique
- `status` supports at least `active`, `pending`, `suspended`, `deleted`
- password login users require `password_hash`

#### `user_profiles`

One-to-one professional profile.

Suggested fields:
- `id`
- `user_id`
- `headline`
- `current_title`
- `summary`
- `years_experience`
- `city`
- `state`
- `country`
- `remote_preference`
- `relocation_preference`
- `target_salary_min`
- `target_salary_max`
- `preferred_language`
- `created_at`
- `updated_at`

#### `auth_accounts`

Provider-linked identities.

Suggested fields:
- `id`
- `user_id`
- `provider`
- `provider_account_id`
- `provider_email`
- `access_token_encrypted` nullable
- `refresh_token_encrypted` nullable
- `token_expires_at` nullable
- `created_at`
- `updated_at`

Rules:
- unique on (`provider`, `provider_account_id`)
- providers include `credentials`, `google`, `linkedin`
- supports linking multiple providers to one user

#### `refresh_tokens`

Persistent refresh sessions.

Suggested fields:
- `id`
- `user_id`
- `token_hash`
- `user_agent`
- `ip_address`
- `expires_at`
- `revoked_at` nullable
- `created_at`

Rules:
- raw refresh tokens are never stored
- logout revokes the token row used in the session

### Candidate data

#### `resumes`

Base resume metadata and future processing anchors.

Suggested fields:
- `id`
- `user_id`
- `title`
- `source_file_name` nullable in this slice
- `source_file_url` nullable in this slice
- `source_file_type` nullable in this slice
- `raw_text` nullable
- `parsed_json` nullable
- `normalized_json` nullable
- `status`
- `is_primary`
- `created_at`
- `updated_at`

Rules:
- one user may own many resumes
- one user may have at most one primary resume
- status begins with at least `draft`, `uploaded`, `reviewed`, `failed`

### Company and source catalog

#### `companies`

Suggested fields:
- `id`
- `name`
- `normalized_name`
- `website_url`
- `careers_url`
- `linkedin_url`
- `industry`
- `country`
- `is_active`
- `created_at`
- `updated_at`

Rules:
- `normalized_name` indexed for deduplication and lookup

#### `job_sources`

Suggested fields:
- `id`
- `company_id`
- `source_name`
- `source_type`
- `source_url`
- `parser_key`
- `crawl_strategy`
- `is_active`
- `check_interval_minutes`
- `last_checked_at` nullable
- `last_success_at` nullable
- `last_error_at` nullable
- `last_error_message` nullable
- `created_at`
- `updated_at`

Rules:
- source types include at least `workday`, `greenhouse`, `lever`, `gupy`, `kenoby`, `successfactors`, `custom_html`, `custom_api`

### Canonical jobs

#### `jobs`

Suggested fields:
- `id`
- `company_id`
- `job_source_id`
- `external_job_id` nullable
- `source_job_url`
- `canonical_key`
- `title`
- `normalized_title`
- `description_raw`
- `description_clean`
- `location_text`
- `city`
- `state`
- `country`
- `work_model`
- `seniority_level`
- `employment_type`
- `salary_min` nullable
- `salary_max` nullable
- `salary_currency` nullable
- `published_at_source` nullable
- `first_seen_at`
- `last_seen_at`
- `status`
- `metadata_json` nullable
- `created_at`
- `updated_at`

Rules:
- `canonical_key` indexed and unique enough for the future ingestion pipeline
- `first_seen_at` required from the first schema version of this table
- `status` supports at least `active`, `inactive`, `removed`

## API Design

### Auth flow

- Credentials auth uses email + password hash verification.
- Social auth uses OAuth redirect/callback handled by the API.
- If social provider email matches an existing account, the provider may be linked to the same user according to explicit linking rules in the auth service.
- Successful login returns access token + refresh token payload.
- Access token is short-lived.
- Refresh token is long-lived, hashed in persistence, and rotated on refresh.
- `GET /auth/me` is JWT-protected and returns the current user plus minimal profile context.

### Ownership rules

- `users/profile`, `resumes`, and future private candidate data are always scoped to the authenticated user.
- `companies`, `job-sources`, and `jobs` may begin as internal/admin-oriented CRUD surfaces in this slice, even if public admin UX does not exist yet.
- API DTOs must avoid leaking password hashes, provider secrets, or raw refresh tokens.

## Module Boundaries in `apps/api`

- `auth` owns strategies, token issuance, refresh rotation, and provider linking.
- `users` owns user record access and sanitization of user-facing payloads.
- `profiles` owns one-to-one profile CRUD and validation.
- `resumes` owns resume metadata CRUD, primary-resume semantics, and user scoping.
- `companies` owns company catalog persistence.
- `job-sources` owns source catalog persistence.
- `jobs` owns canonical job persistence and retrieval, including `first_seen_at` and `canonical_key` rules.
- cross-module orchestration should happen through services, not direct controller coupling.

## Security and Correctness Requirements

- Passwords must be hashed with a modern password hasher.
- Refresh tokens must be stored only as hashes.
- JWT secrets and OAuth credentials must come from validated env configuration.
- OAuth callback handling must validate provider identity and normalize provider payloads before persistence.
- Social login must not create duplicate users for the same verified email without explicit logic.
- DTO validation must exist at request boundaries.
- Sensitive fields must never be returned in serialized API responses.

## Testing Strategy

- Prisma schema and service logic should get focused tests around invariants such as unique email, one primary resume per user, refresh token hashing, and required `first_seen_at` on jobs.
- Auth tests should cover register, login, refresh, logout, `me`, and provider-linking decisions.
- Module/controller tests should verify authenticated ownership boundaries.
- This slice should verify both build-time correctness and behavioral correctness for the first real API workflows.

## Risks

- Social auth can inflate scope quickly if provider handling is not kept narrow and symmetric.
- Authentication may sprawl into the web app if API-first boundaries are not kept strict.
- Schema overreach could delay the slice if we try to model all downstream modules now.
- Job storage can become ingestion-coupled too early if this slice tries to implement crawler behavior instead of persistence boundaries.

## Mitigations

- Keep social auth limited to Google and LinkedIn callback/login/linking behavior only.
- Keep this slice API-first and leave web integration for a later slice.
- Model only the entities needed for auth, candidate data ownership, and ingestion-ready job persistence.
- Treat `jobs` in this slice as canonical storage, not as a crawler implementation.

## Acceptance Criteria

- `packages/database` contains the first real Prisma schema, migrations, and local seed support for the core entities in this slice.
- `apps/api` exposes working auth endpoints for credentials, refresh, logout, `me`, Google login, and LinkedIn login.
- `apps/api` exposes working CRUD surfaces for profiles, resumes, companies, job sources, and jobs.
- user-scoped resources are protected by JWT guards and do not leak across accounts.
- refresh tokens are persisted as hashes and rotated/revoked through the auth flow.
- `jobs` persistence requires and stores `first_seen_at` from the first implementation of the table.
- the slice is ready for the next ingestion-focused module to attach crawler and normalization workflows without schema churn.
- `apps/web` remains on the current mock seam during this slice.

## Next Slice Relationship

After this slice, the next step is the ingestion module:

- crawler adapter architecture
- source execution runs
- snapshot comparison
- normalization pipeline
- job upsert and deduplication behavior
- transition of the public web job seam toward API-backed data

## Implemented State And Handoff

- `packages/database` is now the source of truth for the first real domain schema, with initial migration, seed entrypoint, and schema contract coverage already in place.
- `apps/api` is already wired through `AppModule` with auth, profiles, resumes, companies, job-sources, and jobs loaded together with env/database/infra/health.
- The verified API env surface is `DATABASE_URL`, `API_HOST`, `API_PORT`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `LINKEDIN_CALLBACK_URL`.
- Full slice verification should be run from the repo root in this order: `npm run generate --workspace @earlycv/database`, `npm run lint`, `npm run check`, `npm run build`, `npm run test`, `npm ls --workspaces --depth=0`.
- `apps/web` still reads jobs from the mock seam; do not start the web integration before the ingestion layer can populate and stabilize canonical jobs.
- Immediate next step tomorrow: start the ingestion-focused slice on top of `Company`, `JobSource`, and `Job`, keeping `canonicalKey` and `firstSeenAt` as stable invariants instead of redesigning the schema again.
