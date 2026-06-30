# Master CV Canonical Extraction Design

## Context

EarlyCV already stores uploaded Master CV files and uses canonical profile data to unlock profile mode. Today, canonical enrichment after upload is mostly heuristic, which can leave users blocked in `profile` mode even with a valid base CV.

This design introduces a dedicated AI extraction flow for Master CV canonical data, fully separated from existing CV analysis and CV generation prompts.

## Product Goals

- Never block analysis flow because canonical extraction is pending or failed.
- Extract a complete canonical profile from Master CV text as early as possible after upload.
- Return explicit extraction coverage so UI can show what was auto-filled and what remains for manual completion.
- Preserve product invariants: never invent facts; keep traceability to source CV text.

## Non-Goals

- No changes to existing adaptation prompts used by `/cv-adaptation/analyze` and paid CV generation.
- No replacement of `ProfileCanonicalMergeService` semantics beyond adding one new source type.
- No requirement to make profile extraction synchronous during upload request.

## High-Level Approach

Recommended approach:

1. On Master CV upload/update, extract `rawText` as today.
2. Enqueue an asynchronous canonical extraction job.
3. Run a new dedicated AI prompt that outputs:
   - complete canonical profile payload,
   - extraction coverage (`filled`/`partial`/`missing` per field),
   - confidence and evidence metadata.
4. Validate output against strict schema.
5. Merge into `userProfile` through `ProfileCanonicalMergeService` and recompute readiness.
6. Persist extraction coverage for post-upload UX and manual completion prompts.

Analysis flow remains resilient: if profile is not yet ready, API/UI falls back to `masterResumeId` behavior instead of blocking.

## Architecture

### New backend slice

Create a new module under `apps/api/src/master-cv-canonical-extraction`:

- `master-cv-canonical-extraction.module.ts`
- `master-cv-canonical-extraction.service.ts`
- `master-cv-canonical-extraction.worker.ts` (queue consumer)
- `master-cv-canonical-extraction.schema.ts` (runtime validation)
- `master-cv-canonical-extraction.types.ts`

This keeps boundaries explicit and avoids coupling with existing cv-adaptation prompt logic.

### AI integration boundary

Add a new function in `packages/ai` (separate file), for example:

- `packages/ai/src/master-cv-canonical-extraction.ts`

This file owns the new prompt and response schema contract. Existing functions (`analyzeAndAdaptCv`, `adaptCv`, etc.) are unchanged.

### Queue integration

Use `packages/queue` for async execution.

Job payload:

```ts
type MasterCvCanonicalExtractionJob = {
  userId: string;
  resumeId: string;
  inputHash: string;
  triggeredBy: "master_cv_upload" | "analysis_fallback_retry";
};
```

## Data Model

Add a persistence model for extraction state and UX payload. Recommended new table:

`MasterCvCanonicalExtraction`

- `id`
- `userId`
- `resumeId`
- `inputHash`
- `status` (`pending | processing | succeeded | failed`)
- `attempts`
- `lastError`
- `canonicalJson` (validated extraction output snapshot)
- `coverageJson` (UI-facing extraction coverage)
- `confidenceJson`
- `evidenceJson`
- `startedAt`
- `finishedAt`
- `createdAt`
- `updatedAt`

Indexes:

- `(resumeId, inputHash)` unique for idempotency
- `(userId, createdAt desc)` for latest status lookup
- `(status, updatedAt)` for operations/monitoring

## Prompt Contract (Dedicated)

Input:

- `masterCvText` (already extracted from uploaded file)
- optional locale hint (`pt-BR` default)

Output JSON (strict):

```ts
type CanonicalExtractionOutput = {
  canonicalProfile: {
    fullName: string | null;
    headline: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    location: {
      city: string | null;
      state: string | null;
      country: string | null;
    };
    professionalSummary: string | null;
    experiences: Array<{
      role: string | null;
      company: string | null;
      location: string | null;
      startDate: string | null;
      endDate: string | null;
      bullets: string[];
      technologies: string[];
    }>;
    education: Array<{
      institution: string | null;
      degree: string | null;
      fieldOfStudy: string | null;
      startDate: string | null;
      endDate: string | null;
    }>;
    skills: {
      technical: string[];
      business: string[];
      soft: string[];
    };
    languages: Array<{
      language: string;
      level: string | null;
    }>;
    certifications: Array<{
      name: string;
      issuer: string | null;
      year: string | null;
    }>;
  };
  extractionCoverage: {
    identifiedFields: string[];
    missingFields: string[];
    fieldStatus: Record<string, "filled" | "partial" | "missing">;
  };
  confidence: Record<string, number>;
  evidence: Record<string, string[]>;
};
```

Hard guardrails in prompt:

- Never invent experiences, roles, dates, skills, certificates, or contact data.
- Only return fields with textual evidence from CV.
- Unknown/missing must be `null` or empty arrays.
- `fieldStatus` must reflect data completeness (`filled`, `partial`, `missing`).

## Merge Rules

Use `ProfileCanonicalMergeService` as source of truth for conflict resolution.

- New merge source: `base_cv_ai_extraction`.
- Empty existing field + valid incoming value -> fill.
- Existing value + low-confidence incoming value -> do not overwrite.
- Arrays (skills, bullets, etc.) -> normalize and deduplicate case-insensitively.
- Recompute `profileReadinessStatus` after merge.

Store metadata in `profileFieldMetaJson` and `profileSuggestionsJson` with:

- source (`base_cv_ai_extraction`)
- `resumeId`
- timestamp
- confidence per field when available

## UX Contract

After upload, frontend needs structured feedback:

- "We extracted these fields"
- "These fields are still missing"
- CTA to manually complete missing fields

Expose endpoint (or extend existing status endpoint) to fetch latest extraction snapshot by user:

```ts
{
  status: "pending" | "processing" | "succeeded" | "failed";
  extractionCoverage?: {
    identifiedFields: string[];
    missingFields: string[];
    fieldStatus: Record<string, "filled" | "partial" | "missing">;
  };
  updatedAt: string;
}
```

## Error Handling and Retries

- Retry transient AI/transport failures up to 3 attempts with backoff.
- Mark permanent validation failures as `failed` with safe `lastError`.
- Never throw extraction errors back to the upload request after enqueue success.
- Optional fallback trigger: on analysis call, if latest extraction is `failed` and hash changed, enqueue one recovery retry.

## Observability

Emit metrics/logs:

- jobs created, processing, succeeded, failed
- latency p50/p95
- average identified fields per extraction
- readiness transitions (`empty -> partial`, `partial -> ready`)

Runbook additions in `docs/runbook/` should cover:

- queue backlog checks
- retry/poison message handling
- direct production rollback (without feature flag)

## Rollout Plan

1. Deploy directly to staging and validate queue/merge metrics.
2. Deploy directly to production with close monitoring in the first 24h.
3. Run controlled backfill for existing Master CVs.
4. Remove temporary fallback heuristics only after extraction quality SLO is met.

## Testing Strategy

- Unit tests for prompt output schema validation.
- Unit tests for merge rules (`filled/partial/missing`, confidence-aware overwrite).
- Worker tests for idempotency (`resumeId + inputHash`) and retry behavior.
- Integration tests for upload -> job enqueued -> profile merged -> readiness recomputed.
- Web/API contract tests for extraction coverage payload used by UI.

## Risks and Mitigations

- **Risk:** Hallucinated structured fields.
  - **Mitigation:** strict prompt + schema + evidence requirement + conservative merge.
- **Risk:** Slow/failed async jobs.
  - **Mitigation:** retries, status visibility, no user-flow hard dependency.
- **Risk:** Regressions in profile mode gating.
  - **Mitigation:** preserve analysis fallback and explicit tests for non-blocking flow.

## Success Criteria

- Uploading a Master CV no longer leaves users blocked from progressing with analysis.
- Canonical profile completeness increases measurably after upload.
- UI can always show extracted vs missing fields using `extractionCoverage`.
- Existing analysis/generation prompts remain unchanged.
