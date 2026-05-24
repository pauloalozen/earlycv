# Design: Jobs Portal Ghost Mode (Admin/Superadmin Only)

## Context and Goal

EarlyCV will run ingestion in production for about two weeks before publicly launching the jobs portal. During this period, the jobs catalog and job pages must be visible only to internal operators (`admin` and `superadmin`) and hidden from all other users and crawlers.

Primary objective:

- Enable safe production validation of ingestion quality and stability without exposing `/vagas` publicly.

Hard requirements agreed:

- Access allowed only for `admin` and `superadmin`.
- Non-authorized access must return `404` (not `401`/`403`).
- Public jobs API endpoints must also be blocked for non-admin/superadmin.
- Robots/indexers must be blocked from indexing jobs URLs.
- Behavior must be controlled by environment flag.

## Scope

### In scope

- Conditional ghost mode flag for jobs portal access.
- Access control updates in:
  - `apps/web/src/app/vagas/page.tsx`
  - `apps/web/src/app/vagas/[slug]/page.tsx`
  - `apps/api/src/jobs/public-jobs.controller.ts`
- SEO/robots behavior updates for jobs pages while ghost mode is enabled.
- Robots/sitemap consistency while ghost mode is enabled.
- Automated tests for ON/OFF behavior and role-based access.

### Out of scope

- Changes to ingestion job execution logic.
- Changes to job ranking/scoring internals.
- UI redesign of jobs pages.
- Permanent authorization model rewrite.

## Feature Flag Design

Add environment variable:

- `JOBS_GHOST_MODE` (`"true" | "false"`, default `"false"`)

Behavior:

- `JOBS_GHOST_MODE=false` (or unset): current behavior remains.
- `JOBS_GHOST_MODE=true`: activate admin/superadmin-only access and crawler blocking for jobs portal surfaces.

## Access Control Design

## Web app routes

Affected routes:

- `/vagas`
- `/vagas/[slug]`

Ghost mode ON behavior:

- Resolve current user via existing session helper (`getCurrentAppUserFromCookies`).
- Allow rendering only when `user.internalRole` is `admin` or `superadmin`.
- Otherwise call `notFound()`.

Ghost mode OFF behavior:

- Preserve existing public behavior.

Notes:

- This mirrors the existing internal-surface pattern already used by `/admin` and `/superadmin` layouts.

## API endpoints

Affected endpoints in `PublicJobsController`:

- `GET /api/public/jobs`
- `GET /api/public/jobs/facets`
- `GET /api/public/jobs/:slug`

Ghost mode ON behavior:

- Require authenticated user with internal role in `admin|superadmin`.
- For all non-authorized cases (missing token, invalid token, wrong role), return `404`.

Ghost mode OFF behavior:

- Keep current public access for these endpoints.

Implementation shape:

- Add a dedicated guard (or guarded helper) for ghost mode that:
  1. Bypasses checks when flag is OFF.
  2. Validates auth + role when flag is ON.
  3. Throws `NotFoundException` on failure.
- Reuse existing auth/role conventions where possible.

Why 404:

- Hides route existence and reduces signal for automated probing/scraping during ghost period.

## SEO and Crawler Blocking

Ghost mode ON:

- `/vagas` metadata: `robots` set to noindex/nofollow.
- `/vagas/[slug]` metadata: `robots` set to noindex/nofollow.
- `robots.txt`: include `Disallow: /vagas`.
- Sitemap generation: omit `/vagas` and `/vagas/*` entries while flag is ON.

Ghost mode OFF:

- Restore current indexing behavior for jobs portal.

Consistency rule:

- Avoid contradictory signals (for example, keeping jobs URLs in sitemap while disallowing indexing).

## Security and Product Invariants

- No changes to job identity or freshness invariants (`canonicalKey`, `firstSeenAt`).
- No changes to ingestion run mechanics.
- No data mutation side effects from ghost mode; this is exposure-layer only.

## Testing Strategy

## Web tests

- Add/extend tests for `/vagas` and `/vagas/[slug]`:
  - Ghost ON + `admin`: success render.
  - Ghost ON + `superadmin`: success render.
  - Ghost ON + normal user/no session: not found.
  - Ghost OFF: public behavior preserved.

## API tests

- Add tests around `PublicJobsController` (or e2e if preferred):
  - Ghost ON + `admin` token: `200`.
  - Ghost ON + `superadmin` token: `200`.
  - Ghost ON + missing/invalid token: `404`.
  - Ghost ON + non-admin role: `404`.
  - Ghost OFF + anonymous: existing public `200` behavior preserved.

## SEO/robots tests

- Validate metadata robots output in ghost mode for both jobs routes.
- Validate sitemap excludes jobs routes when ghost mode is ON.
- Validate `robots.txt` disallow rule for `/vagas` when ghost mode is ON.

## Rollout Plan

1. Deploy with code supporting flag.
2. Set `JOBS_GHOST_MODE=true` in production.
3. Run ingestion and operational checks during two-week ghost window.
4. After validation period, set `JOBS_GHOST_MODE=false` to open portal publicly.

Rollback:

- Immediate revert of exposure behavior by toggling env flag to `false`.

## Risks and Mitigations

- Risk: accidental API exposure while web is blocked.
  - Mitigation: enforce same ghost rule at API controller level.
- Risk: indexing signal mismatch.
  - Mitigation: align metadata + robots.txt + sitemap under same flag.
- Risk: role-check drift across web/api.
  - Mitigation: reuse existing role model (`admin|superadmin`) and cover via tests.

## Forward-Looking Note: Future `jobId` Exposure

Current state:

- The adaptation flow does not currently send `jobId` to API endpoints; it sends job description text and optional title/company metadata.

Future risk:

- If a future endpoint accepts `jobId` as input (for example, prefill or direct adaptation from catalog), that endpoint may become a lateral data-exposure path during ghost mode.

Mandatory rule for future endpoints:

- Any endpoint that resolves or returns job catalog data by `jobId` must enforce the same ghost mode authorization policy (`admin|superadmin` only while `JOBS_GHOST_MODE=true`) and return `404` for non-authorized access.

Review checklist item:

- During ghost mode, reject PRs that add new job lookup paths (`jobId`, slug, canonical key) without explicit ghost guard coverage.

## Acceptance Criteria

- With `JOBS_GHOST_MODE=true`:
  - Only `admin` and `superadmin` can access `/vagas` and `/vagas/[slug]`.
  - Non-authorized users receive `404` on both web routes and public jobs API endpoints.
  - Crawlers are instructed not to crawl/index jobs URLs.
- With `JOBS_GHOST_MODE=false`:
  - Current public jobs experience and API behavior remain unchanged.
