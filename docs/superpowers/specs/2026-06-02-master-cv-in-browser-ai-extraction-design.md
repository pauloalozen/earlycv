# Master CV In-Browser AI Extraction Design

## Context

Today, Master CV upload can populate `userProfile` through a small heuristic parser and an optional asynchronous canonical-extraction pipeline. That is not the desired product flow.

The user flow for `/dashboard` should behave like `/adaptar`: upload the file, run protected AI extraction immediately in the backend, and return structured extraction coverage so the UI can show what was filled and what is still missing.

## Goal

- Run Master CV canonical extraction synchronously as part of the upload request.
- Accept the raw uploaded file as the AI input, not pre-extracted text.
- Support PDF text, PDF image, and DOCX through the same upload path used by `/adaptar`.
- Reuse the same anti-abuse protections already applied to `/adaptar` uploads.
- Persist the extraction result and merge it into `userProfile` without inventing facts.

## Non-Goals

- No queue/worker-based processing for the primary user flow.
- No new user-facing upload flow separate from the existing dashboard CV master card.
- No change to `/adaptar` behavior beyond reusing the same protection patterns and upload constraints.

## Proposed Flow

1. User uploads a CV master file from `/dashboard`.
2. Web sends the file to the API using multipart/form-data, including turnstile token.
3. API validates file type/size and anti-abuse protections.
4. API forwards the raw file to the Master CV AI extraction service.
5. AI returns canonical profile data plus coverage/evidence/confidence metadata.
6. API persists `MasterCvCanonicalExtraction` and merges allowed fields into `userProfile`.
7. API returns the extraction status payload for UI rendering.

## Backend Boundary

The existing `MasterCvCanonicalExtractionService` remains the canonical merge path, but its input changes from plain text to the uploaded file payload.

The service must accept:

- file buffer
- original filename
- mimetype
- size

The AI contract must be updated to accept the file payload or an equivalent binary representation, rather than requiring pre-extracted text.

## Security and Abuse Protection

The upload must reuse the same safety model as `/adaptar`:

- turnstile verification
- upload MIME allowlist
- file size limit
- request-level anti-abuse checks already used by analysis flows

The dashboard upload should not bypass these protections just because it is a profile feature.

## Data Model

Reuse the existing `MasterCvCanonicalExtraction` table for:

- status
- attempts
- lastError
- canonicalJson
- coverageJson
- confidenceJson
- evidenceJson

The upload request should create the extraction record and update it with the final AI result in the same request lifecycle.

## UI Contract

The dashboard should receive a structured response that allows it to display:

- extracted fields
- missing fields
- extraction status
- last update timestamp

If extraction fails, the dashboard should still show the saved CV master and the partial state that was available.

## Guardrails

- Never invent fields that are not supported by the uploaded file.
- Prefer null/empty arrays over guessing.
- Keep traceability via `evidenceJson` and `profileFieldMetaJson`.
- If the upload is rejected by protection rules, return a clear API error and do not persist a successful extraction state.
