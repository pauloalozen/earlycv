# Landing Variant C Design

## Context

The web app currently supports landing variants A and B, selected by `NEXT_PUBLIC_LANDING_VARIANT`.
The goal is to add variant C as a hybrid:

- base structure and flow from variant A
- include two sections from variant B:
  - satisfaction guarantee section
  - creator quote section
- preserve product visual direction (dark-on-light monochromatic language)
- keep A and B behavior unchanged

## Goals

1. Introduce a new selectable landing variant `C`.
2. Compose variant C from variant A plus specific B sections.
3. Keep section order and placement from B for the inserted blocks:
   - guarantee first
   - creator quote second
   - both before final CTA
4. Maintain existing functionality, SEO behavior, and routing.

## Non-Goals

- Refactor A/B into shared section components in this change.
- Rewrite copy, visual style, or layout of existing A/B variants.
- Change public route structure or metadata strategy.

## Proposed Approach (Approved)

Create `LandingVariantC` as a new independent component based on `LandingVariantA`, then transplant the two approved blocks from `LandingVariantB` at the same page position relative to final CTA.

Why this approach:

- low-risk and fast delivery
- isolates experiment logic per variant
- avoids introducing broader refactor scope now

## Architecture and File Changes

### 1) Variant typing and resolution

Update `apps/web/src/app/_landing/variant.ts`:

- extend `LandingVariant` from `"A" | "B"` to `"A" | "B" | "C"`
- update `resolveLandingVariant(rawVariant)` to return `"C"` when env equals `"C"`
- keep default fallback to `"A"`

### 2) New variant component

Add `apps/web/src/app/_landing/variant-c.tsx`:

- start from variant A structure and content
- include same imports used by A
- add `Image` import from `next/image` (needed for creator quote card)
- insert B sections before final CTA, in this order:
  1. Guarantee section
  2. Founder/creator quote section

### 3) Variant selection branch

Update the landing entrypoint that switches A/B rendering:

- add branch for `"C"` to render `LandingVariantC`
- keep A and B branches unchanged

## UX and Content Rules

- Use exactly the approved content blocks from B for guarantee and creator quote.
- Preserve order and placement parity with B.
- Keep all other sections aligned with A.
- Do not introduce orange accents (per product direction).

## Data Flow

- No new backend/API dependencies.
- Still driven by process environment (`NEXT_PUBLIC_LANDING_VARIANT`).
- Rendering remains server-compatible with existing App Router behavior.

## Error Handling

- Unknown variant values continue to resolve to A (safe fallback).
- If C is selected and component compiles, runtime behavior matches existing static variant rendering pattern.

## Testing Strategy

1. Update `apps/web/src/app/_landing/variant.test.ts`:
   - add expectation for `resolveLandingVariant("C") === "C"`
   - ensure existing tests for A default and B resolution remain valid
2. Manual smoke check:
   - run web app with `NEXT_PUBLIC_LANDING_VARIANT=C`
   - confirm page renders with A structure
   - confirm guarantee + creator sections appear before final CTA

## Risks and Mitigations

- Risk: visual/responsive mismatch when moving B blocks into A.
  - Mitigation: copy section blocks and inline styles as-is from B.
- Risk: branching bug in variant resolver/entrypoint.
  - Mitigation: explicit resolver test coverage for C.

## Acceptance Criteria

1. Env `NEXT_PUBLIC_LANDING_VARIANT=C` renders variant C.
2. Variant C uses variant A as base layout and flow.
3. Variant C includes guarantee and creator quote sections from B, in same order and position before final CTA.
4. Variants A and B still render exactly as before.
5. Variant resolver tests pass with C coverage.

## Rollback

- Revert files related to variant C and resolver branch.
- Fallback behavior remains A by default.

## Out of Scope Follow-up (Optional)

- Future refactor to extract reusable sections shared across variants to reduce duplication once experiment direction stabilizes.
