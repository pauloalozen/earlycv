## Context

The admin ingestion flow currently has two operational gaps:

1. Source-level scheduling visibility/control is weak in the UI. Operators need to quickly answer:
   - if a source has a scheduled run,
   - when it runs,
   - and to enable/disable it safely.
2. Manual batch run summary numbers can be inconsistent in the detail page. Real example observed:
   - Total: 68
   - Success: 264
   - Failed: 2
   - Skip: 82
   This breaks trust in the dashboard and slows incident triage.

Scope is restricted to admin ingestion UX + operational consistency. No changes to product-facing public jobs UX.

## Goals

1. Make source schedule state explicit and operable in admin.
2. Ensure manual run summary shown in UI is always internally coherent.
3. Reduce probability of counter inflation in manual runner processing.

## Non-Goals

- Reworking ingestion adapters business logic (Gupy/custom parsing behavior).
- Introducing a full calendar/next-run engine in DB.
- Historical data backfill/migration of old inconsistent manual run counters.

## Current Behavior (Relevant)

- Source scheduling fields already exist and are used by scheduler:
  - `scheduleEnabled`
  - `scheduleCron`
  - `scheduleTimezone`
- Global scheduler exists and runs each minute; source schedules are matched via cron.
- Manual run detail page renders summary from persisted run counters:
  - `totalSources`, `succeededCount`, `failedCount`, `skippedCount`
- Manual runner increments counters while processing items; race/duplication scenarios can lead to inflated numbers.

## Proposed Design

### 1) Source Schedule Visibility and Toggle (Admin)

#### 1.1 Source Detail Page

In `apps/web/src/app/admin/ingestion/[jobSourceId]/page.tsx`, add a dedicated `Agendamento` card:

- `Status`: `Escalonado` when `scheduleEnabled=true` and cron present; otherwise `Desligado`.
- `Cron`: show raw `scheduleCron` (or `-` when absent).
- `Timezone`: show `scheduleTimezone` (default display `America/Sao_Paulo`).
- `Controles`:
  - toggle/checkbox to enable or disable scheduling,
  - cron input to edit `scheduleCron`.

Server action on submit updates only schedule fields for the source (no parser or adapter changes).

#### 1.2 Source List Tab

In `apps/web/src/app/admin/ingestion/page.tsx` (`Fontes` tab), add compact `Agendamento` column:

- `ligado` + cron snippet when enabled,
- `desligado` when disabled.

This enables quick triage across many companies without opening each source detail.

### 2) Manual Run Summary: UI Source of Truth = Items

In `apps/web/src/app/admin/ingestion/manual/[batchRunId]/page.tsx`, compute displayed summary from loaded `items` instead of persisted run counters.

Display rules:

- `Total` = `items.length`
- `Sucesso` = count of items with `status=completed`
- `Falha` = count of items with `status=failed`
- `Skip` = count of items with `status in (skipped, cancelled)`

Also show helper text: `Calculado a partir dos itens do lote`.

Rationale:

- `items` are the most concrete operational record for that run page.
- Prevents incoherent UI even if aggregate counters drift.

### 3) Manual Runner Counter Hardening (Cause Mitigation)

In `apps/api/src/ingestion/ingestion-manual-runner.service.ts`, harden item processing to reduce double counting risk:

1. Before processing each item, re-check current item status from DB and proceed only if still eligible.
2. Ensure final transitions are monotonic (`queued/running -> completed/failed/skipped/cancelled`) and counter increment occurs only once per item finalization path.
3. Add a defensive consistency check at run finalization path so updates do not push `succeeded+failed+skipped` above `totalSources`.

This does not require schema changes.

## API and Data Contract Impact

- No mandatory API contract break for web pages.
- Existing `JobSource` payload already includes schedule fields used by UI.
- Existing manual run item payload already includes per-item status needed for recomputed summary.

## UX and Copy

- Keep monochromatic admin style consistent with existing pages.
- Use concise labels in PT-BR:
  - `Agendamento`
  - `Escalonado` / `Desligado`
  - `Cron`
  - `Fuso`
  - `Calculado a partir dos itens do lote`

## Testing Strategy

### Web

- Source detail schedule card renders correct state for enabled/disabled sources.
- Schedule update action updates UI feedback and persisted values.
- Source list tab shows schedule badge/summary correctly.
- Manual run detail summary matches table statuses in mixed scenarios (`completed`, `failed`, `skipped`, `cancelled`).

### API

- Manual runner tests for race-like scenarios to ensure no duplicate increments.
- Cancellation path test confirms counters and status remain coherent.
- Guard test validating aggregate counters do not exceed `totalSources`.

## Rollout and Backward Compatibility

- Safe incremental rollout; no migration required.
- Historical inconsistent runs remain in DB, but the detail page will display coherent values derived from items.

## Risks and Mitigations

1. Risk: derived UI summary differs from persisted run counters and causes confusion in debugging.
   - Mitigation: explicit helper text and keep persisted counters available for deeper ops logs if needed.
2. Risk: schedule toggle might be changed accidentally.
   - Mitigation: show clear status and success banner; preserve current admin confirmation conventions.
3. Risk: hidden runner edge cases still exist.
   - Mitigation: add targeted runner tests and enforce monotonic status transitions.

## Success Criteria

1. Admin can identify schedule state and cron for any source in under 5 seconds.
2. Admin can enable/disable source scheduling directly from source detail page.
3. Manual run summary in detail page is always arithmetically coherent with item statuses.
4. New manual runs no longer produce inflated success/failure/skip counters relative to total.
