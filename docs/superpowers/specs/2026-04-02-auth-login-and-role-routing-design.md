# Auth Login And Role Routing Design

## Context

The web app already has public pages, a manual backoffice token flow, and API auth endpoints for `register`, `login`, `refresh`, `logout`, and `me`. Internal access is modeled on the API with `internalRole` (`none`, `admin`, `superadmin`) plus `isStaff`. The current admin and superadmin routes in `apps/web` rely on a manually supplied bearer token stored in a dedicated backoffice cookie.

The requested change is to introduce a real login screen in the web app, add clear entry points from the homepage, persist authenticated sessions with secure cookies, redirect users based on role after login, and add email verification for newly registered email/password accounts.

- `admin` and `superadmin` go to `/admin`
- non-staff users go to `/dashboard`
- authenticated but unverified users go to `/verificar-email`

`/dashboard` is intentionally a protected placeholder for now.

## Goals

- Add a public `/login` page aligned with the current EarlyCV visual language.
- Add email verification after email/password registration.
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
- Wiring a real third-party email delivery provider in this phase.

## Recommended Approach

Use a server-driven auth flow in `apps/web`.

The login form posts to a web-owned route handler or server action. That server-side entry point calls the API `POST /auth/login`, stores the returned `accessToken` and `refreshToken` in HTTP-only cookies, then resolves the destination by reading the returned user payload. This keeps tokens off the client, fits the existing Next App Router structure, and gives the app one shared session model for public, member, and staff experiences.

The existing manual backoffice token flow should stop being the primary path into admin. A thin compatibility layer is acceptable during transition, but the new session should be the default source of truth for protected web routes.

For email verification, introduce an API-side delivery abstraction with a fake/mock provider used in tests and local development. Registration should create a verification challenge and call that abstraction. This keeps the feature testable now and ready for a future SES/Resend/Postmark integration without reshaping auth flows later.

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

### Email Verification Page

Add a protected route at `/verificar-email` for authenticated but unverified users.

It should:

- explain that access stays blocked until the email is confirmed
- show the target email address when available
- provide one field for the verification code
- provide a primary action to validate the code
- provide a secondary action to resend the code
- display concise success and failure messages

### Dashboard Placeholder

The initial `/dashboard` route is protected and intentionally minimal. It should confirm the user is logged in, greet them by name if available, show a short "em desenvolvimento" message, and offer a safe logout path. It is a real route, not a mock-only component.

## Routing Rules

### Post-Login Destination

- `internalRole = admin` -> `/admin`
- `internalRole = superadmin` -> `/admin`
- `internalRole = none` -> `/dashboard`

This keeps the first redirect simple and aligned with the request. `superadmin` users can still navigate to `/superadmin` after entering the staff area.

### Protected Routes

- `/dashboard` requires any authenticated and verified user.
- `/admin` requires an authenticated, verified staff user with `internalRole = admin | superadmin`.
- `/superadmin` requires an authenticated, verified staff user with `internalRole = superadmin`.
- `/verificar-email` requires an authenticated but unverified user.
- `/login` redirects away when a valid session exists.

### Unauthorized Handling

- no session -> redirect to `/login`
- expired access token with valid refresh token -> refresh server-side and continue
- invalid session after refresh attempt -> clear cookies and redirect to `/login`
- authenticated but unverified user -> redirect to `/verificar-email`
- authenticated user without required role -> redirect to their correct home (`/dashboard` for common users, `/admin` for staff that lack `superadmin`)

## Email Verification Architecture

### Verification Challenge Model

Add a persistence model for email verification challenges instead of overloading the `User` row. The model should support:

- `userId`
- a hashed verification code
- expiration timestamp
- consumption timestamp
- created timestamp

Only one active challenge needs to matter at a time for normal flows, but the schema should support invalidating older codes when a new one is issued.

### Registration Flow

For email/password registration:

1. create the user with `emailVerifiedAt = null`
2. create a verification challenge
3. dispatch the raw code through the email delivery port
4. issue the normal auth session so the user can continue into the verification route
5. redirect the user to `/verificar-email`

### Verification Flow

The verification submission should:

1. require an authenticated session
2. look up the active verification challenge for that user
3. compare the submitted code against the stored hash
4. reject expired, consumed, or invalid codes
5. mark the challenge as consumed
6. set `emailVerifiedAt`
7. redirect to the normal role-based destination

### Resend Flow

Resend should invalidate prior active codes for the user, generate a new code, store a new hashed challenge, and send another email through the same delivery port.

### Email Delivery Port

Introduce an interface-like service boundary on the API for sending transactional emails. The first implementation should be a fake/local sender suitable for tests and development. It must be replaceable later by a real provider adapter without changing controller or auth-service contracts.

Tests can assert on captured deliveries from the fake sender rather than integrating a real transport.

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
- returning a normalized session model with user identity, role information, and verification state
- calculating the correct destination route for a user

This layer should be separate from the current `backoffice-session` helper because that helper is conceptually tied to manually bootstrapped admin bearer tokens.

### API Integration

The API already returns session data for login and refresh. The web app should consume that response as-is and avoid inventing a parallel auth contract. If the current response shape is slightly insufficient for routing decisions, the adjustment should happen at the API boundary in a backward-compatible way.

The same applies to registration and email verification endpoints: the API should own verification lifecycle and expose clear endpoints the web app can call without embedding verification business rules in the frontend.

## Compatibility With Existing Admin Pages

Current admin and superadmin pages call server-side helpers that expect a backoffice token. During implementation, the preferred direction is:

1. derive admin API authorization from the new app session cookies
2. preserve existing admin page composition where possible
3. phase out manual token entry as the main path

If a short-lived bridge is needed, it should be implemented in one place, not scattered across pages.

## Components And Files To Add Or Change

Likely additions or changes include:

- Prisma schema and migration updates for email verification challenges
- API auth endpoints or DTOs for verify-email and resend-code actions
- API email delivery abstraction plus fake/mock implementation
- homepage CTA updates in `apps/web/src/app/page.tsx`
- new public auth screen(s) in `apps/web/src/app/login/page.tsx`
- new protected page at `apps/web/src/app/verificar-email/page.tsx`
- new protected placeholder at `apps/web/src/app/dashboard/page.tsx`
- session helpers under `apps/web/src/lib/` for cookie read/write/refresh/me/redirect
- web route handler or server action for login submission
- web route handler or server action for register, verify-email, and resend-code submissions
- logout endpoint or action to clear cookies
- route guards implemented via server helpers and, if worthwhile, middleware only where it clearly reduces duplication

The implementation should prefer server-side guards in layouts/pages first. Middleware is optional, not mandatory.

## Error Handling

- invalid credentials return the login form with a friendly inline message
- network or API availability failures return a generic retry message without exposing stack traces
- invalid refresh clears cookies before redirecting
- invalid or expired verification codes return a targeted message on `/verificar-email`
- resend failures return a retry message and do not mutate local session state
- role mismatch uses redirects, not raw 403 pages, for this first pass

## Testing Strategy

Implementation must follow TDD.

Core automated coverage should include:

- registration tests proving a verification challenge is created and a fake email delivery is emitted
- verification tests for valid code, invalid code, expired code, and resend invalidation
- session helper tests for route resolution by role and verification state
- login handler tests for cookie writing and destination redirects
- route guard tests for unverified users redirecting to `/verificar-email`
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

### Risk: Verification delivery gets coupled to a fake sender

Mitigation: depend on an email delivery port from auth flows and keep the fake sender behind that boundary.

## Success Criteria

- A visitor can open `/login`, submit valid credentials, and land on the correct route by role.
- A newly registered email/password user receives a verification code via the fake email delivery layer.
- An authenticated but unverified user is redirected to `/verificar-email` until the code is confirmed.
- A valid verification code marks `emailVerifiedAt` and unlocks the normal role-based destination.
- A staff user no longer needs to paste a manual bearer token to start using the admin area.
- A common authenticated user is routed to `/dashboard`.
- Protected routes reject missing or invalid sessions consistently.
- Session state survives normal page navigation through HTTP-only cookies.
