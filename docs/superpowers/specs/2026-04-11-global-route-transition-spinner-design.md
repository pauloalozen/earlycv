# Global Route Transition Spinner and Smooth Reveal

## Context

The web app currently mixes transition behavior: a global `app/template.tsx` fade plus route-level loading/reveal logic in specific pages (for example, `/adaptar/resultado`). This creates inconsistency and still allows users to see UI assembly during navigation.

We need one default pattern for all existing and future routes: during client-side route transitions, show a full-screen spinner, then reveal the new route with a smoother animation than the current one.

Explicit scope decision from product alignment:

- Apply spinner only to route-to-route transitions.
- Do not force spinner for the first hard load.

## Goals

- Hide route assembly during SPA navigation.
- Standardize transition behavior in one central place.
- Improve perceived smoothness of page reveal.
- Keep SEO, metadata, and SSR behavior intact.
- Automatically apply to future routes without per-page work.

## Non-Goals

- No redesign of page content.
- No route-specific loading skeleton project.
- No changes to business logic, auth, or API behavior.

## Recommended Approach

Use a single global transition controller in `apps/web/src/app/template.tsx` (Client Component), with CSS-driven phases and a full-screen overlay spinner.

Why this approach:

- `template.tsx` remounts on navigation in App Router, making it a natural transition boundary.
- One implementation point keeps behavior consistent across all routes.
- New routes inherit behavior automatically.

## UX Contract

On route transitions:

1. Show full-screen overlay spinner immediately.
2. Keep overlay for a short minimum dwell to avoid flicker.
3. Fade overlay out.
4. Reveal content with smoother fade + slight upward settle.

Visual and timing baseline:

- Overlay background: `#F2F2F2`.
- Minimum spinner dwell: ~180ms.
- Content reveal: 320-380ms, `cubic-bezier(0.22, 1, 0.36, 1)`.
- Motion offset smaller than current (`translateY(4px)` recommended).

Accessibility:

- Spinner icon marked decorative (`aria-hidden="true"`).
- `prefers-reduced-motion` disables animations and minimizes transition delay.

## Architecture

### 1) Global transition shell in `app/template.tsx`

- Convert file to Client Component.
- Introduce local transition phase state:
  - `loading` (overlay visible, content hidden)
  - `revealing` (overlay fading out, content animating in)
  - `done` (steady state)
- Phase progression is controlled by short timers in `useEffect` on mount.

Because template remounts on route navigation, this phase sequence runs per navigation and acts as global default behavior.

### 2) Shared CSS in `app/globals.css`

Add route-transition classes:

- Overlay container class (fixed, full-screen, centered spinner).
- Spinner class (existing visual language).
- Content container phase classes (`loading`, `revealing`, `done`).
- Keyframes for overlay fade-out and content reveal.
- Reduced-motion override.

Keep CSS token usage consistent with existing light theme.

### 3) Remove duplicated route-level reveal mechanics

Where pages currently implement local route-level reveal overlays, remove those wrappers to prevent double loading layers and animation conflicts.

Known target in this slice:

- `apps/web/src/app/adaptar/resultado/page.tsx` (existing `ready` overlay and transition styles)

## Compatibility and Risk Management

- SEO: unchanged (metadata pipeline untouched).
- SSR: unchanged for page content generation.
- Navigation UX: improved consistency.
- Risk of perceived added latency mitigated with short minimum dwell.
- Reduced-motion users receive minimal/no animation.

## Validation Plan

Functional validation:

- Navigate between core routes (`/`, `/adaptar`, `/adaptar/resultado`, `/dashboard`, `/planos`, `/entrar`).
- Confirm spinner appears only during route transitions.
- Confirm first hard page load is not artificially blocked.

Visual validation:

- Ensure no content flash during route transition.
- Ensure overlay fade and reveal are smooth and less abrupt than current behavior.

Regression validation:

- `npm run check`
- `npm run test`

## Rollout Notes for Future Routes

- New routes require no extra implementation for default transition behavior.
- Route-level loading UIs (`loading.tsx`) remain optional for long data fetch flows and can coexist if needed.
