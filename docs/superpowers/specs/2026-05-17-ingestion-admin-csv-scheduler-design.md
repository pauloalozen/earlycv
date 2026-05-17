# Design: Ingestion Admin CSV + Scheduler Controls

## Context and Goals

EarlyCV already has a manual ingestion backbone with:

- company CRUD (`/companies`)
- job source CRUD + manual run endpoints (`/job-sources`)
- ingestion run audit (`/runs` and `/job-sources/:id/runs`)
- a web admin surface in `apps/web/src/app/admin/ingestion`

The next step is to improve operator throughput without duplicating domain tables or creating parallel admin modules with the same purpose.

This design adds:

1. CSV-based bulk company/source onboarding
2. Adapter inference rule with safe fallback
3. Better run visibility (global + per source)
4. Scheduling controls (per source cron + global sequential cron)
5. Deletion actions for companies and sources in admin

Hard constraints agreed with stakeholder:

- Reuse existing models and screens whenever possible
- Do not create new company/source/run tables with duplicate purpose
- If adapter cannot be inferred, default to `custom_html`
- Global scheduler must run sequentially with anti-blocking delays
- Cron timezone is fixed to `America/Sao_Paulo`

## Scope

### In scope

- CSV import flow in admin for company/source onboarding
- API endpoint(s) to process CSV and return per-line report
- Upsert behavior for existing companies
- Source creation/update with adapter inference
- Per-source cron scheduling fields and controls
- Global cron scheduling controls (single global config)
- Global runs list in admin (plus existing per-source detail)
- Company/source delete actions in admin

### Out of scope

- Replacing ingestion adapters
- Redesigning all admin IA/routes
- Queue infrastructure redesign
- Multi-timezone scheduling

## Existing System Reuse Strategy

- Keep `Company`, `JobSource`, `IngestionRun` as primary ingestion domain entities.
- Reuse existing services (`CompaniesService`, `JobSourcesService`, `IngestionService`) and add an orchestration layer in ingestion/admin flow.
- Reuse existing `/admin/ingestion` and `/admin/ingestion/[jobSourceId]` pages as the main operational hub.
- Reuse current delete endpoints:
  - `DELETE /companies/:id`
  - `DELETE /job-sources/:id`

## Data and Persistence Design

## Existing models kept

- `Company`
- `JobSource`
- `IngestionRun`

## Minimal schema evolution

### `JobSource` (per-source schedule)

Add optional fields:

- `scheduleCron: String?`
- `scheduleEnabled: Boolean @default(false)`
- `scheduleTimezone: String @default("America/Sao_Paulo")`

Behavior notes:

- If `scheduleEnabled = false`, source cron is ignored.
- If `scheduleEnabled = true`, `scheduleCron` must be present and valid.
- Timezone is fixed operationally to Sao Paulo; persisted for explicitness and future resilience.

### Global scheduler config

Introduce one global configuration record for ingestion orchestration (single row pattern) containing:

- `enabled: Boolean`
- `globalCron: String?`
- `timezone: String` (fixed value `America/Sao_Paulo`)
- `normalDelayMs: Int`
- `errorDelayMs: Int`

This is not a duplicate domain entity for company/source/run; it is operational config.

## CSV Import Functional Design

## File contract

- Header (first line):
  - `nome,setor,site_url,careers_url,linkedin_url`
- Delimiter: comma
- Ignore empty lines

## Line-level semantics

- Required per line:
  - `nome`
  - `careers_url`
- Optional:
  - `setor`
  - `site_url`
  - `linkedin_url`

## Adapter inference and fallback

- If `careers_url` contains `gupy` (case-insensitive):
  - `sourceType = gupy`
  - `crawlStrategy = api`
  - `parserKey = gupy`
- Otherwise:
  - `sourceType = custom_html`
  - `crawlStrategy = html`
  - `parserKey = custom_html`

## Company upsert rule (approved)

- Match existing company by normalized name (`normalizedName` from `nome`).
- If found:
  - update provided company fields
  - do not erase existing values when CSV column is empty
- If not found:
  - create company

## Source create/update rule

- Use `careers_url` as `JobSource.sourceUrl`.
- Use unique identity `(companyId, sourceUrl)`.
- If source exists, update relevant source fields (type/parser/strategy/name/active).
- If source does not exist, create it.

## API Design

## New/extended endpoints (admin-protected)

### CSV import

- `POST /admin/ingestion/company-sources/import-csv`
- Content type: `multipart/form-data`
- Input:
  - `file` (CSV)
- Output:
  - aggregate summary
  - per-line report with action and errors

Example response shape:

```json
{
  "summary": {
    "totalLines": 120,
    "successCount": 114,
    "errorCount": 6,
    "companiesCreated": 20,
    "companiesUpdated": 94,
    "sourcesCreated": 88,
    "sourcesUpdated": 26
  },
  "lines": [
    {
      "line": 2,
      "companyName": "ACME",
      "companyAction": "updated",
      "sourceAction": "created",
      "inferredAdapter": "gupy",
      "status": "success",
      "message": "company updated and source created"
    }
  ]
}
```

### Global scheduler config

- `GET /admin/ingestion/scheduler/global`
- `PUT /admin/ingestion/scheduler/global`

Update payload:

- `enabled: boolean`
- `globalCron: string | null`
- `normalDelayMs: number`
- `errorDelayMs: number`

### Source scheduler controls

Use existing `job-sources` update endpoint, extending DTO to accept schedule fields:

- `scheduleEnabled`
- `scheduleCron`
- `scheduleTimezone`

### Runs list (global)

Reuse existing `GET /runs` and enrich list payload with source/company projection needed by admin table (without creating a separate runs domain).

## Scheduler Runtime Design

## Per-source cron

- Scheduler scans active sources with `scheduleEnabled = true` and valid `scheduleCron`.
- Triggers source run through `IngestionService.runJobSource(sourceId)`.

## Global cron (sequential batch)

- On each global tick:
  1. Acquire global run lock (prevent overlapping global batches).
  2. Fetch eligible active sources.
  3. Sort deterministically (company name asc, source name asc, id tie-break).
  4. Execute one source at a time.
  5. Wait:
     - `normalDelayMs` after success
     - `errorDelayMs` after error
  6. Continue after per-source failure (do not abort entire batch).
  7. Release lock and log batch summary.

## Concurrency and collision rules

- If a source already has a `running` run, skip that source in global batch and record reason.
- Manual run requests still use existing source-level conflict behavior.
- Source cron and global cron must not execute the same source concurrently.

## Admin UI/UX Design (reuse-first)

## `/admin/ingestion`

Add sections to existing page:

1. **CSV import card**
   - file input + submit
   - result banner and concise report summary
   - optional expandable per-line report
2. **Global scheduler card**
   - enable toggle
   - cron expression input
   - `normalDelayMs` input
   - `errorDelayMs` input
   - save action + validation feedback
3. **Runs global table**
   - columns: company, source, startedAt, status, new/updated/failed, details link
   - filters by company/status/time window

Keep existing source cards and augment each with:

- source cron controls (enable + cron)
- manual run action (existing)
- delete source action (new UI control reusing existing API)

## `/admin/ingestion/[jobSourceId]`

- Preserve as per-source detail/audit screen.
- Ensure run list shows clear timestamps/status and links to run details.

## Company delete UI

- Add delete action in existing company management surface in admin.
- Explicit confirmation warning about cascade delete of related sources/runs/jobs.

## Error Handling and Validation

## CSV validation

- reject invalid header order/name
- reject oversized file
- reject malformed rows with line-level error
- continue processing remaining lines (best-effort batch)

## Cron validation

- reject invalid cron expressions with clear message
- enforce delay lower/upper bounds (operational safety)
- timezone fixed to `America/Sao_Paulo`

## Domain conflict handling

- existing unique constraint conflicts return readable admin messages
- source already running returns non-fatal status in global batch execution report

## Observability and Audit

- Keep `IngestionRun` as canonical run history.
- Enrich execution context metadata for origin:
  - `manual`
  - `source_cron`
  - `global_cron`
- Global batch logs:
  - startedAt/finishedAt
  - eligible sources
  - succeeded/failed/skipped counts
  - total duration

## Testing Strategy

## API tests

- CSV import:
  - creates new company/source
  - updates existing company
  - infers gupy adapter by `careers_url`
  - falls back to `custom_html`
  - line-level errors do not abort whole batch
- Scheduler config:
  - update/read global config
  - validate invalid cron and invalid delays
- Runtime:
  - sequential global execution order
  - delay behavior for success/error path
  - no concurrent duplicate source run
- Delete flows:
  - delete source success
  - delete company with cascade behavior

## Web tests

- CSV upload submit flow and feedback rendering
- source scheduler controls and save flow
- global scheduler form save flow
- delete actions with confirmation and banner status
- global runs list rendering with key columns

## Rollout and Migration Notes

- Apply Prisma migration for new schedule fields and global config storage.
- Follow repo convention:
  - run migration
  - run `npm run railway:touch-api`
  - commit migration + `apps/api/.railway-redeploy` together
- Launch behind admin-only routes already protected with `admin/superadmin` roles.

## Risks and Mitigations

- **Risk:** malformed CSV noise and operator confusion
  - **Mitigation:** strict header check + per-line report + aggregate summary
- **Risk:** Gupy blocking due to burst behavior
  - **Mitigation:** sequential global run + configurable delays in admin
- **Risk:** schedule collisions
  - **Mitigation:** running lock checks and skip-with-reason semantics
- **Risk:** accidental destructive delete
  - **Mitigation:** explicit confirmation copy and clear cascade warning

## Acceptance Criteria

1. Operator uploads CSV with agreed columns and onboard companies/sources in batch.
2. Adapter is set to `gupy` when `careers_url` contains `gupy`; otherwise `custom_html`.
3. Existing companies are updated (not duplicated) and sources are upserted by `(companyId, sourceUrl)`.
4. Admin sees run history globally and by source, including company, time and status.
5. Admin configures cron per source and global cron with configurable delays.
6. Global cron executes sequentially and respects anti-blocking delays.
7. Admin can delete source and company through UI using existing API behavior.
