# Manual Ingestion Background Jobs (Adapter Scope) - Design

Date: 2026-05-17
Owner: EarlyCV ingestion/admin
Status: approved in chat, pending implementation plan

## 1. Context and problem

The current admin ingestion flow allows manual execution but waits for synchronous completion. This creates three operational gaps:

1. No manual "run by adapter" operation (for example, all `gupy` sources).
2. Manual run blocks the UI/action until completion.
3. No dedicated operational job log with progress and cancellation controls.

These gaps hurt day-to-day operations and reduce control over ingestion incidents.

## 2. Goals

1. Allow manual execution by adapter (`gupy`, `custom_html`, `custom_api`).
2. Execute manual runs in background (async) so the UI is not blocked.
3. Provide an operations view with job progress, source/company status, and cancellation.

## 3. Non-goals (for this slice)

1. No hard kill of in-flight parser/network process.
2. No external queue infra (Redis/BullMQ) in this slice.
3. No parallel fan-out execution tuning yet (start with deterministic sequential processing).

## 4. Product rules and invariants

1. Manual adapter run targets all active sources with the selected adapter:
   - filter: `isActive=true` and `sourceType=<adapter>`
   - `scheduleEnabled` is ignored for manual run scope.
2. Existing ingestion/source locking semantics remain authoritative.
3. `firstSeenAt` and canonical ingestion invariants remain unchanged (existing ingestion pipeline is reused, not rewritten).
4. Timezone conventions remain `America/Sao_Paulo` where applicable.

## 5. Proposed architecture

### 5.1 New persisted execution model

Add two operational tables:

1. `IngestionBatchRun` (one background job request)
2. `IngestionBatchItem` (one source execution item inside the batch)

`IngestionBatchRun` fields:

- `id`
- `scopeType`: enum (`adapter`, `source`, `global`)
- `scopeValue`: string (e.g. `gupy`)
- `status`: enum (`queued`, `running`, `completed`, `failed`, `cancelling`, `cancelled`)
- `requestedByUserId`
- `startedAt`, `finishedAt`, `cancelRequestedAt`
- `totalSources`, `succeededCount`, `failedCount`, `skippedCount`
- `createdAt`, `updatedAt`

`IngestionBatchItem` fields:

- `id`
- `batchRunId`
- `jobSourceId`
- denormalized context: `companyId`, `companyName`, `sourceName`, `sourceType`
- `status`: enum (`queued`, `running`, `completed`, `failed`, `skipped`, `cancelled`)
- `startedAt`, `finishedAt`
- `errorMessage` (sanitized)
- `ingestionRunId` (nullable FK to existing ingestion run audit when available)
- `createdAt`, `updatedAt`

### 5.2 Async execution flow

1. Admin triggers manual run by adapter.
2. API creates `IngestionBatchRun` + all `IngestionBatchItem` rows in `queued` state.
3. API returns immediately with `202 Accepted` and `batchRunId`.
4. Background runner service picks queued/running batches and processes items sequentially.
5. Each item uses existing `IngestionService.runJobSource(sourceId)`.
6. Item/batch counters and statuses are updated after each item.

### 5.3 Background runner service

Create `IngestionManualRunnerService` in API layer:

- Trigger cadence: short cron tick (for example every 10s).
- Single runner semantics guarded by existing DB lock patterns.
- Item execution is sequential for deterministic operations and straightforward cancellation.
- Error policy in this slice: fail item and continue batch.

### 5.4 Cancellation semantics

Endpoint marks `cancelRequestedAt` and sets batch `status=cancelling` when allowed.

Runner behavior:

1. Before starting each next item, check cancellation flag.
2. If cancellation requested:
   - do not start additional queued items,
   - mark remaining queued items as `cancelled` (or `skipped_cancelled` equivalent using existing enum strategy),
   - mark batch `cancelled` with `finishedAt`.

Important: currently running item is not force-killed; it finishes naturally.

## 6. API surface

All routes remain under existing admin-guarded ingestion area.

1. Start manual adapter run:
   - `POST /api/runs/manual/adapter/:adapterType`
   - returns `202` with `{ batchRunId, status }`
2. List manual batch runs:
   - `GET /api/runs/manual?status=&scopeType=&limit=&cursor=`
3. Batch run detail:
   - `GET /api/runs/manual/:batchRunId`
4. Batch run items:
   - `GET /api/runs/manual/:batchRunId/items?status=&limit=&cursor=`
5. Cancel batch run:
   - `POST /api/runs/manual/:batchRunId/cancel`

Validation:

- `adapterType` must be one of allowed source adapters.
- Start endpoint rejects empty source target set with clear message.
- Cancel endpoint is idempotent for terminal states.

## 7. Admin web UX

## 7.1 Trigger operations

On `/admin/ingestion` add "Rodar por adapter" controls:

- Buttons/select for `gupy`, `custom_html`, `custom_api`.
- Action calls start endpoint and immediately returns with success message + batch id.
- No UI blocking waiting for execution completion.

### 7.2 Manual jobs panel

Add section "Execucoes manuais":

- list of recent batch runs with status chips, progress counters, requested time/user.
- "Ver detalhes" opens a run detail page (or inline drawer).
- "Cancelar job" visible only for `queued`/`running`/`cancelling` states.

### 7.3 Run detail and logs

Detail view shows:

- batch metadata (scope, status, timestamps, counters),
- currently running company/source when applicable,
- item table (company, source, status, started/finished, error summary),
- pagination/filter by item status.

## 8. Data flow

1. UI submits adapter run request.
2. API persists batch + items.
3. Runner claims batch, marks it `running`, processes items in order.
4. For each item:
   - acquire source lock,
   - run ingestion,
   - store resulting status and optional `ingestionRunId`,
   - release lock,
   - update counters.
5. Batch transitions to terminal status when all items resolved or cancellation concluded.

## 9. Error handling

1. Source-level failures are contained to item status `failed`; batch continues.
2. Runner-level unexpected error marks batch `failed` with best-effort finalization.
3. API always returns sanitized error messages for admin display.
4. Cancel requests on terminal jobs return success-compatible idempotent response.

## 10. Testing strategy

### 10.1 API unit tests

1. Adapter selection uses `isActive=true` and ignores `scheduleEnabled`.
2. Batch status transitions (`queued -> running -> completed`, cancellation path, failure path).
3. Cancellation stops scheduling next items.
4. Idempotent cancellation behavior.

### 10.2 API integration tests

1. Start/list/detail/items/cancel endpoints under admin role.
2. Non-admin rejection coverage.
3. Background runner progression updates persisted states.

### 10.3 Web tests

1. Server actions for manual adapter run are non-blocking (no synchronous full run dependency).
2. UI shows batch list/status and conditional cancel control.
3. Detail rendering includes source/company-level execution states.

## 11. Rollout and migration

1. Add Prisma models + migration.
2. Deploy API with new endpoints and runner.
3. Deploy web with new controls/panels.
4. Monitor first manual runs via admin panel and API logs.

## 12. Open decisions deferred

1. Per-adapter concurrency knobs.
2. Retry policies per failed item.
3. External queue adoption (Redis/BullMQ) for higher-scale execution.

These are intentionally deferred to keep this slice focused on operational control and non-blocking execution.
