# Auth Login And Role Routing Design

## Context

The web app already has public pages, a manual backoffice token flow, and API auth endpoints for `register`, `login`, `refresh`, `logout`, and `me`. Internal access is modeled on the API with `internalRole` (`none`, `admin`, `superadmin`) plus `isStaff`. The current admin and superadmin routes in `apps/web` rely on a manually supplied bearer token stored in a dedicated backoffice cookie.

The requested change is to introduce a real login screen in the web app, add clear entry points from the homepage, persist authenticated sessions with secure cookies, and redirect users based on role after login:

- `admin` and `superadmin` go to `/admin`
- non-staff users go to `/dashboard`

`/dashboard` is intentionally a protected placeholder for now.

## Goals

- Add a public `/login` page aligned with the current EarlyCV visual language.
- Add a visible `Entrar` action on the homepage.
- Persist web sessions with HTTP-only cookies and API refresh support.
- Redirect authenticated users by role on login and when revisiting `/login`.
- Protect `/admin`, `/superadmin`, and `/dashboard` with the same session model.
- Keep the implementation ready for a fuller member dashboard later.

## Non-Goals

- Building the real product dashboard experience.
- Reworking public signup or social login UX.
- Redesigning the whole homepage.
- Replacing every existing admin data helper in one sweep if a compatibility bridge is cheaper.

## Recommended Approach

Use a server-driven auth flow in `apps/web`.

The login form posts to a web-owned route handler or server action. That server-side entry point calls the API `POST /auth/login`, stores the returned `accessToken` and `refreshToken` in HTTP-only cookies, then resolves the destination by reading the returned user payload. This keeps tokens off the client, fits the existing Next App Router structure, and gives the app one shared session model for public, member, and staff experiences.

The existing manual backoffice token flow should stop being the primary path into admin. A thin compatibility layer is acceptable during transition, but the new session should be the default source of truth for protected web routes.

## User Experience

### Homepage

The public landing page keeps its current content hierarchy and visual direction. Add `Entrar` in the top navigation and near the primary hero actions without turning the header into a crowded auth bar. `Comecar agora` remains the acquisition CTA.

### Login Page

The login page is a dedicated public route at `/login`.

It should:

- use the current light background and terracotta/orange accent system
- present a focused email/password form
- include one primary `Entrar` button
- show a short helper note for users accessing staff areas and regular product accounts through the same screen
- render a concise inline error for invalid credentials or expired/invalid session transitions

If the user already has a valid session, `/login` immediately redirects to the correct destination.

### Dashboard Placeholder

The initial `/dashboard` route is protected and intentionally minimal. It should confirm the user is logged in, greet them by name if available, show a short "em desenvolvimento" message, and offer a safe logout path. It is a real route, not a mock-only component.

## Routing Rules

### Post-Login Destination

- `internalRole = admin` -> `/admin`
- `internalRole = superadmin` -> `/admin`
- `internalRole = none` -> `/dashboard`

This keeps the first redirect simple and aligned with the request. `superadmin` users can still navigate to `/superadmin` after entering the staff area.

### Protected Routes

- `/dashboard` requires any authenticated user.
- `/admin` requires an authenticated staff user with `internalRole = admin | superadmin`.
- `/superadmin` requires an authenticated staff user with `internalRole = superadmin`.
- `/login` redirects away when a valid session exists.

### Unauthorized Handling

- no session -> redirect to `/login`
- expired access token with valid refresh token -> refresh server-side and continue
- invalid session after refresh attempt -> clear cookies and redirect to `/login`
- authenticated user without required role -> redirect to their correct home (`/dashboard` for common users, `/admin` for staff that lack `superadmin`)

## Session Architecture

### Cookies

Add a dedicated app session cookie pair, for example:

- `earlycv-access-token`
- `earlycv-refresh-token`

Both should be HTTP-only. `secure` should be enabled in production. Use `sameSite=lax` unless an existing deployment constraint requires something else. Scope the cookies to the app root path.

### Session Helper Layer

Create a shared server-only auth module in the web app responsible for:

- reading auth cookies
- clearing auth cookies
- calling API `GET /auth/me`
- calling API `POST /auth/refresh`
- retrying `me` after a successful refresh
- returning a normalized session model with user identity and role information
- calculating the correct destination route for a user

This layer should be separate from the current `backoffice-session` helper because that helper is conceptually tied to manually bootstrapped admin bearer tokens.

### API Integration

The API already returns session data for login and refresh. The web app should consume that response as-is and avoid inventing a parallel auth contract. If the current response shape is slightly insufficient for routing decisions, the adjustment should happen at the API boundary in a backward-compatible way.

## Compatibility With Existing Admin Pages

Current admin and superadmin pages call server-side helpers that expect a backoffice token. During implementation, the preferred direction is:

1. derive admin API authorization from the new app session cookies
2. preserve existing admin page composition where possible
3. phase out manual token entry as the main path

If a short-lived bridge is needed, it should be implemented in one place, not scattered across pages.

## Components And Files To Add Or Change

Likely additions or changes include:

- homepage CTA updates in `apps/web/src/app/page.tsx`
- new public page at `apps/web/src/app/login/page.tsx`
- new protected placeholder at `apps/web/src/app/dashboard/page.tsx`
- session helpers under `apps/web/src/lib/` for cookie read/write/refresh/me/redirect
- web route handler or server action for login submission
- logout endpoint or action to clear cookies
- route guards implemented via server helpers and, if worthwhile, middleware only where it clearly reduces duplication

The implementation should prefer server-side guards in layouts/pages first. Middleware is optional, not mandatory.

## Error Handling

- invalid credentials return the login form with a friendly inline message
- network or API availability failures return a generic retry message without exposing stack traces
- invalid refresh clears cookies before redirecting
- role mismatch uses redirects, not raw 403 pages, for this first pass

## Testing Strategy

Implementation must follow TDD.

Core automated coverage should include:

- session helper tests for route resolution by role
- login handler tests for cookie writing and destination redirects
- refresh-path tests covering expired access token plus valid refresh token
- invalid session tests covering cookie cleanup and redirect to `/login`
- protected page tests verifying common-user and staff-user access rules
- homepage test updates if CTA expectations are currently asserted

Verification should include the specific workspace tests touched by the change and the relevant repo-wide checks after feature completion.

## Risks And Mitigations

### Risk: Existing admin screens assume manual bearer token bootstrapping

Mitigation: add a single adapter from app session to admin API authorization before touching many pages.

### Risk: Refresh behavior becomes duplicated across pages

Mitigation: keep refresh-and-load-session logic in one shared server utility.

### Risk: `/superadmin` authorization becomes inconsistent with `/admin`

Mitigation: use one normalized role-check helper that all protected routes share.

## Success Criteria

- A visitor can open `/login`, submit valid credentials, and land on the correct route by role.
- A staff user no longer needs to paste a manual bearer token to start using the admin area.
- A common authenticated user is routed to `/dashboard`.
- Protected routes reject missing or invalid sessions consistently.
- Session state survives normal page navigation through HTTP-only cookies.
