# Admin + Superadmin Visual Migration Design

Date: 2026-05-03
Owner: EarlyCV web
Status: Approved in chat, pending written-spec review

## Context

This design defines the full visual migration of legacy routes under `/admin/**` and `/superadmin/**` to the active EarlyCV visual standard, including metadata consistency.

Constraints and product alignment:

- Follow `CODE_GUIDELINES.md` section 7 visual direction.
- Keep a dark-on-light monochromatic language.
- Preserve a light visual distinction between `/admin` and `/superadmin`.
- Migrate all routes in both trees, not only overview pages.
- Standardize metadata for internal routes (`noindex`, consistent titles).
- Keep current business behavior unchanged (visual/UX consistency only, no rule changes).

## Goals

1. Achieve a consistent UI language across all `/admin/**` and `/superadmin/**` pages.
2. Remove legacy style drift and ad-hoc visual exceptions from old pages.
3. Preserve intentional role distinction:
   - `/admin`: operational cockpit tone.
   - `/superadmin`: institutional/governance tone.
4. Ensure internal metadata consistency for all migrated pages.
5. Keep responsive behavior solid on desktop and mobile.

## Non-goals

- No backend/domain behavior changes.
- No routing or permission model redesign.
- No SEO expansion for private/internal pages beyond consistent noindex/title hygiene.
- No broad refactor of unrelated public pages.

## Scope

In scope:

- Every page in `apps/web/src/app/admin/**`.
- Every page in `apps/web/src/app/superadmin/**`.
- Shared shell/header/section visual primitives used by these route trees.
- Metadata standardization in all targeted pages.

Out of scope:

- Public marketing pages and candidate-facing pages.
- API contracts and data fetching semantics.

## Approach Options Considered

### Option A (Recommended): Shared base migration + route-tree sweep

Create or harden shared visual structure first (shell, spacing rhythm, card hierarchy, action patterns), then migrate all pages in both trees.

Pros:

- Highest consistency across all routes.
- Lowest long-term maintenance cost.
- Reduces regressions from page-level ad-hoc styling.

Cons:

- Larger first pass touching many files.

### Option B: Page-by-page isolated migration

Migrate each page independently without strengthening shared primitives first.

Pros:

- Faster first visible changes on selected pages.

Cons:

- High inconsistency risk.
- Repeated style decisions and likely follow-up cleanup.

### Option C: Temporary compatibility layer

Add bridge style utilities then gradually replace old patterns.

Pros:

- Lower immediate disruption.

Cons:

- Adds temporary technical debt.
- Delays visual convergence.

Decision: Option A.

## Visual Design Specification

### Shared language (both trees)

- Monochromatic dark-on-light surfaces.
- Consistent content width, spacing steps, section rhythm, and card system.
- Unified typography hierarchy for eyebrow, H1/H2, body, labels, and status text.
- Unified interactive states for links/buttons/chips/forms/tables.
- Replace legacy accent leftovers that conflict with current product direction.

### Intentional distinction (light, not divergent)

- `/admin`:
  - Slightly denser operational presentation.
  - Emphasis on queue state, processing status, and action throughput.
  - Stronger utility affordances for frequent task execution.

- `/superadmin`:
  - Slightly calmer institutional framing.
  - Emphasis on governance summaries, configuration stewardship, and sensitive oversight.
  - More strategic framing in hero/section copy while preserving same core primitives.

Guardrail: distinction must remain subtle; both areas should clearly belong to the same product family.

## Metadata Consistency Specification

For each page in `/admin/**` and `/superadmin/**`:

- Ensure metadata exists and is explicit.
- Set internal-route robots policy to noindex/nofollow.
- Apply consistent title format:
  - `Admin • <Page> | EarlyCV`
  - `Superadmin • <Page> | EarlyCV`
- Keep page heading copy aligned with metadata intent to avoid semantic mismatch.

Notes:

- Canonical/OG/Twitter are not required for private internal routes.
- If any internal route currently has conflicting indexable metadata, normalize it to internal policy.

## Component and File Strategy

Targeted areas include:

- `apps/web/src/app/admin/_components/*`
- `apps/web/src/app/superadmin/_components/*`
- Route pages under both trees (`page.tsx` and relevant colocated UI fragments)

Migration method:

1. Normalize shells/headers and shared section primitives.
2. Apply new style system to overview pages.
3. Sweep list/detail/form flows in each route tree.
4. Sweep metadata declarations in each route page.

## Data Flow and Behavior Safety

- Keep existing data loading, actions, and error handling intact.
- No changes to auth/session checks or role gating.
- Keep URL structures and existing navigation flows.

## Error and Empty-State Consistency

- Standardize treatment of missing token, fetch failures, empty lists, and pending states.
- Reuse existing state components where possible, adjusting only visual semantics.
- Ensure call-to-action clarity remains high in degraded states.

## Accessibility and Responsive Requirements

- Maintain accessible contrast in monochromatic palette.
- Keep keyboard-focus visibility on all actionable elements.
- Ensure readability and layout integrity at mobile breakpoints.
- Avoid horizontal overflow in dense operational tables/cards.

## Verification Plan

Minimum verification after implementation:

1. Workspace checks for web package (`check`, relevant tests if impacted).
2. Manual review of representative pages:
   - `/admin`
   - `/admin/empresas`
   - `/admin/ingestion`
   - `/admin/pagamentos`
   - `/superadmin`
   - `/superadmin/equipe`
   - `/superadmin/configuracoes`
3. Validate metadata behavior on sampled routes (noindex + title consistency).
4. Visual pass on desktop and mobile sizes.

## Risks and Mitigations

- Risk: visual regressions due to broad route coverage.
  - Mitigation: route-tree sweep with shared primitives first, then page-level adjustments.
- Risk: inconsistent metadata after partial migration.
  - Mitigation: explicit metadata checklist per page before completion.
- Risk: accidental behavior changes during UI edits.
  - Mitigation: avoid touching domain logic; keep changes localized to presentation/metadata.

## Rollout Plan

1. Base shared visual primitives and shells.
2. Full `/admin/**` migration.
3. Full `/superadmin/**` migration.
4. Metadata sweep and consistency validation.
5. Verification and cleanup.

## Success Criteria

- All `/admin/**` and `/superadmin/**` routes follow the new visual standard.
- Light distinction between route trees is present and intentional.
- Internal metadata is consistent and non-indexable.
- No functional regressions in route behavior.
- Mobile and desktop experience remains stable.
