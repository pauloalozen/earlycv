# Session Replay Consent Validation Checklist

Use this checklist after deploying consent changes to validate that PostHog session replay stays useful while respecting analytics consent.

## Preconditions

- Consent feature flag enabled in target environment.
- PostHog proxy host reachable (`https://c.earlycv.com.br`).
- Test account available for authenticated routes.

## Scenarios

1. Unknown consent
   - Open the site in a fresh browser profile.
   - Do not interact with consent banner.
   - Confirm no PostHog session replay is created for this visit.

2. Denied consent
   - Click `Recusar analytics` in the banner.
   - Navigate across public and authenticated pages.
   - Confirm no new replay session is captured.

3. Accepted consent
   - Click `Aceitar analytics` in the banner.
   - Navigate and interact with:
     - `/dashboard`
     - `/adaptar`
     - `/adaptar/resultado`
     - `/compras` and checkout pages
   - Confirm replay sessions are recorded.

## Sensitive-field visual checks

In accepted-consent replay recordings, validate that typed content is not visibly exposed for:

- CV text fields
- Job description fields
- Upload file name display
- Email
- Name
- Phone

If no sensitive data is visible, keep current replay setup unchanged.

## Escalation rule

Only propose additional masking, selective blocking, or replay disablement when there is clear visual evidence of sensitive exposure in replay.
