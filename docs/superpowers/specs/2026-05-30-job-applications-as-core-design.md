# Job Applications as Core Product Design

## Context

EarlyCV is being repositioned from a CV-adjustment utility to a job-search organization product.
The central unit becomes the **job application** (the position the user is pursuing), and each
application contains many CV analyses (re-analyses of the same target role/company context).

The current data model already supports this behavior and must remain unchanged:

- `upsertFromCvAdaptation` links many `CvAdaptation` records to one `JobApplication` via
  normalized title+company dedupe (60-day window).
- Job application events already version lifecycle transitions (`ANALYSIS_COMPLETED`, `CV_READY`, etc.).
- User-driven statuses are already protected from automation overrides.

This scope is primarily UI presentation and two targeted backend behavior fixes.

## Scope and Non-Goals

### In scope

- Dashboard no longer presents flat analysis history.
- All analysis access moves under job application detail.
- Application list becomes the operational pipeline (1 row per application).
- Score semantics are unified around "best version" per application.
- Two backend changes:
  1. Remove silent skip when title/company extraction fails.
  2. Allow manual split of one analysis into a new application.

### Out of scope

- Prisma schema refactor/migration.
- Dedupe algorithm changes.
- Job fingerprinting.
- Advanced versioning model redesign.
- "Meus CVs" product line.

## Product Invariants Preserved

- Never invent CV facts.
- `firstSeenAt`/`canonicalKey` invariants remain unchanged and unrelated to this feature slice.
- Application user statuses remain protected from automatic downgrade/overwrite.
- `apps/web` keeps consuming only `apps/api`.

## UX Information Architecture (No Overlap)

### Dashboard (`/dashboard`): Summary and routing only

Keep:

- Greeting and top metrics.
- CV Master card (`Atualizar`, `Ver`, `Eliminar`).
- "Analisar nova vaga" block.
- Danger zone.
- Footer.

Remove:

- Entire "Historico de Analises" paginated list.

Add:

- New "Suas candidaturas" block with top 3 relevant applications.
- Card fields: role title, company, status, best score presentation.
- Single navigation CTA: `Ver todas as candidaturas ->` to `/dashboard/candidaturas`.

Rule:

- No operational actions in dashboard (no download/review/unlock).

### Applications list (`/dashboard/candidaturas`): Pipeline operations

- One card per application, never per analysis.
- Keep status filters (`Todas`, `Em aberto`, `Em processo`, `Finalizadas`).
- Keep `+ Adicionar candidatura` (manual creation with `SAVED` status, no analysis required).

Each card displays:

- ID, role title, company, status.
- Best score presentation (not latest analysis score).
- Date.
- Contextual action (`Analisar vaga`, `Ver historico`, `Preparar entrevista`, etc.).
- `Detalhes` button.
- Fast action `Baixar CV` tied to best analysis.

Locked-state rule for list shortcut:

- When `bestCvState = locked`, the fast action must not debit the credit directly.
- It opens the existing credit-spend confirmation (modal/flow) or routes to detail.
- Never consume a credit silently from a list-level shortcut.

### Application detail (`/dashboard/candidaturas/[id]`): Work hub

Keep:

- Header (role/company/status + open job link + status update).
- Next action block.
- Notes.
- Detail metadata.

History behavior:

- Show each re-analysis entry for that application with score/date.
- Attach operational actions per analysis entry:
  - `Rever analise`
  - `Baixar PDF`
  - `Baixar DOCX`
  - `Liberar CV (1 credito)`
  - `Ajustes feitos`
  - `Ver CV usado na analise`

Visual markers:

- `Melhor versao` (best-scoring version by rule below).
- `Versao atual` (`currentCvAdaptationId`).
- They may differ and both states must be rendered clearly.

## Score and Best-Version Rules

### Definitions

- `bestScore`: highest `scoreAfter` among analyses linked to the application.
- `bestCvAdaptationId`: analysis that owns `bestScore` according to tie-break rules.
- `currentCvAdaptationId`: latest/current analysis pointer used today.

### Tie-break (approved)

When two or more analyses have the same `scoreAfter`:

1. Prefer analysis in `CV_READY` state.
2. If still tied, prefer most recent analysis.

### Presentation rules

- Dashboard summary cards and pipeline cards show best score text:
  - `seu melhor score: X%` when scored.
- Pipeline fast action `Baixar CV` always targets `bestCvAdaptationId`.
- Detail page allows downloading any version, not just best/current.

### Explicit empty state for `SAVED` without analysis

This is a first-class presentation state and must not fall back to `0%`.

- `scorePresentation = not_analyzed` when no linked analysis has a valid `scoreAfter`.
- Dashboard card: show `Ainda nao analisada`.
- Pipeline card: show `Ainda nao analisada` plus helper copy
  `Analise a vaga para gerar seu primeiro score`.
- Download shortcut remains governed by `bestCvState = missing`.
- Never display `0%` as placeholder for missing score.

## Backend Read Model (No Schema Change)

`bestCvAdaptationId` does not exist as persisted DB field and must be computed on read.

Backend service computes application summary on-the-fly from linked analyses:

- `bestScore: number | null`
- `bestCvAdaptationId: string | null`
- `bestCvState: "ready" | "locked" | "missing"`
- `scorePresentation: "scored" | "not_analyzed"`

Algorithm:

1. Load analyses linked by `jobApplicationId`.
2. Rank by `scoreAfter` desc.
3. For ties, prioritize `CV_READY`.
4. For remaining ties, prioritize latest `createdAt`.
5. Derive best summary fields for DTO/view model only.

No persistence backfill and no schema mutation.

## Relevance Ordering for Dashboard Top 3

Priority groups:

1. `IN_PROCESS`, `INTERVIEW`
2. Other open statuses (`SAVED`, `ANALYZED`, `CV_READY`, `APPLIED`, `ASSESSMENT`, `OFFER`)
3. Closed statuses (`HIRED`, `REJECTED`, `WITHDRAWN`)

Within each group:

1. Scored applications first (`scorePresentation = scored` before `not_analyzed`).
2. Higher `bestScore` first.
3. More recently updated first.

## Targeted Backend Change 1: Title and Company Are Mandatory to Persist

### Rule

`jobTitle` and `companyName` are required fields to persist a `JobApplication`.
The system never creates an application with missing or placeholder identity, and never invents
fallback labels. This guarantees a clean, readable pipeline and prevents distinct opportunities
from being merged under a shared placeholder key.

### Identity sources

- Title and company come only from job-text extraction or from manual user input.
- The job URL is not an extraction source. It is stored solely as an outbound link
  (`Abrir vaga`) on the application and never used to derive identity fields.

### New behavior when extraction fails

- The analysis itself still runs and its result is shown to the user. Do not block value
  delivery over missing metadata.
- The application is not created automatically when `jobTitle` or `companyName` could not be
  extracted from the job text.
- Surface a lightweight capture step before the analysis can enter the pipeline: prompt the user
  to provide role title and company (`Para salvar nas suas candidaturas, informe a vaga e a empresa`).
- Once the user supplies both, proceed with the normal flow (dedupe by normalized title+company,
  link adaptation, emit events).
- Do not silently skip, and do not abort the analysis pipeline. The only thing gated is
  application persistence, not analysis delivery.

### Notes

- The dedupe interaction risk disappears: with no placeholder key, no false merges can occur.
- Keep observability logs to monitor extraction-failure volume (informs future extraction-quality work).

## Targeted Backend Change 2: Split Analysis Into New Application

### Problem addressed

Normalized title+company dedupe can group analyses that the user considers distinct opportunities.
We keep dedupe algorithm untouched, but provide explicit user override.

### New action

From application detail, on a specific analysis entry: `Separar em nova candidatura`.

Behavior:

1. Create a new `JobApplication` seeded from the selected analysis data.
2. Re-link selected `CvAdaptation` to the new application.
3. Recompute derived summary (`bestScore`, `bestCvAdaptationId`, `bestCvState`) for both source
   and new application.
4. Repoint the persisted `currentCvAdaptationId` of the source application if the separated
   analysis was its current pointer: set it to the most recent remaining linked analysis (or
   `null` if none remain). The new application's `currentCvAdaptationId` is set to the separated
   analysis.
5. Emit traceable events in both applications with cross references.

Suggested event metadata:

- Source app event: `ANALYSIS_SEPARATED_OUT` with `{ cvAdaptationId, targetApplicationId }`
- New app event: `APPLICATION_CREATED_FROM_SPLIT` with `{ cvAdaptationId, sourceApplicationId }`

Idempotency/domain rules:

- If adaptation already belongs to another application due to prior split, return domain conflict
  with actionable message.
- No dedupe algorithm update required.

## API Contract Adjustments

### `GET /job-applications`

Add derived fields per item:

- `bestScore: number | null`
- `bestCvAdaptationId: string | null`
- `bestCvState: "ready" | "locked" | "missing"`
- `scorePresentation: "scored" | "not_analyzed"`

### `GET /job-applications/highlights?limit=3`

- Returns top relevant applications for dashboard summary using relevance ordering above.
- Includes same derived fields as list.

### `POST /job-applications/:id/analyses/:adaptationId/split`

- Splits selected analysis into a new job application.
- Response: `{ newApplicationId: string }`.
- Domain error on invalid ownership or already split scenarios.

## Error Handling

- No silent success path when key extraction is incomplete.
- Split endpoint validates ownership (`application.userId`, `adaptation.userId`) and relation consistency.
- All new user-facing domain failures return actionable messages for UI toast/modal.

## Testing Strategy

### API tests

- `upsertFromCvAdaptation` does not create an application when title/company missing; analysis
  result is still returned; application is created only after user supplies title+company.
- Best-score derivation with tie-break coverage (`CV_READY` precedence).
- Derived fields appear in list/highlights/detail payloads.
- Split action:
  - success path,
  - ownership violation,
  - already split/idempotency conflict,
  - summary recomputation for both applications,
  - repoint source `currentCvAdaptationId` correctly when the separated analysis was current
    (and set `null` when no analyses remain).

### Web tests

- Dashboard no longer renders flat analysis history block.
- Dashboard renders "Suas candidaturas" top 3 and navigation CTA.
- Pipeline cards show `seu melhor score` only when scored.
- `not_analyzed` UI copy appears for saved applications without analyses.
- Fast download CTA routes state correctly (`ready`, `locked`, `missing`).
- Detail page renders distinct badges for best vs current when different.

## Rollout Notes

- This is a presentation and behavior slice over existing schema.
- No migration needed.
- Backward compatibility should be maintained for existing application records.
- Monitor logs after release for provisional identity volume to inform extraction quality follow-up.

## Success Criteria

- Users no longer see duplicated flat analyses on dashboard.
- Every analysis is reachable via its application context.
- Download quick action is aligned with displayed best score.
- Missing extraction no longer causes hidden missing application records.
- Users can manually correct dedupe grouping by splitting analysis when needed.
