# Archiving and Restore (Job Applications)

## Goal

Let users declutter their pipeline without ever losing access to past work (analyses and released CVs). Archiving is the only user-facing removal action. Applications are never destroyed by the user; they are moved to an "Arquivadas" section and remain fully accessible there.

### Core Principle: Archiving Is a Separate Dimension from Status

Archiving must not be modeled as a job-application status. Status (SAVED, ANALYZED, CV_READY, APPLIED, ASSESSMENT, INTERVIEW, OFFER, HIRED, REJECTED, WITHDRAWN) and visibility (active / archived) are orthogonal. A HIRED application can be either active or archived. Do not collapse archiving into the status field, and do not break existing status filters.

### Data Model (No Schema Refactor, Two Nullable Timestamps)

Add two nullable timestamp fields to JobApplication:

archivedAt: DateTime | null — set when the user archives, cleared on restore. Drives the active/archived split in the UI.
deletedAt: DateTime | null — soft-delete marker, not exposed in the UI. Reserved for administrative/LGPD/abuse removal only.

Visibility rules everywhere:

Active pipeline: archivedAt IS NULL AND deletedAt IS NULL.
Archived section: archivedAt IS NOT NULL AND deletedAt IS NULL.
Never returned to client: deletedAt IS NOT NULL (always filtered out of all user-facing queries).

No migration beyond adding the two nullable columns. No backfill. Existing records default to both null (active), preserving backward compatibility.
User Mental Model (Important)
The user never manages CVs as standalone objects. From the user's perspective, a CV always lives inside its application. The underlying data relationship may be flexible, but the UI must keep the mental model rigid and simple: CVs are reached through their application, including in the archived section. Do not expose any "loose CV" concept or any "attach CV to application" action.
Single User-Facing Actions

Arquivar candidatura — sets archivedAt = now(). Removes the application from the active pipeline and from the dashboard "Suas candidaturas" summary. Moves it to "Arquivadas".
Restaurar candidatura — clears archivedAt. Returns the application to the active pipeline.

There is no user-facing "delete". Anything the user wants gone is archived. This is intentional: a simpler one-action model that needs no manual.
UI Behavior
Applications list (/dashboard/candidaturas)

Default view shows only active applications.
Add an "Arquivadas" entry point alongside the existing status filters (Todas, Em aberto, Em processo, Finalizadas). Treat archived as a separate view/segment, not as a status filter mixed with the others. Archived applications must not appear under Todas or any status filter while archived.
Archiving is not available from the list card. The list cards stay focused on the primary contextual CTA.
In the archived view, each card exposes Restaurar as its primary action.

Application detail (/dashboard/candidaturas/[id])

The Arquivar action lives here, on the detail page only. This is the single place a user can archive an application (archiving happens when the user is looking at the application up close and decides they are done with it).
After archiving, send the application to the archived view and remove it from the active pipeline (redirect or optimistic update acceptable).
The detail page of an archived application also exposes Restaurar.

Archived section

Renders the same card and detail capabilities as active.
Download of released CVs must remain fully active here. Do not hide or disable Baixar CV, Baixar PDF, Baixar DOCX, or Rever análise for archived applications. The whole point is preserving access.
Detail page is reachable for archived applications; all history/timeline and per-analysis actions remain available.

Dashboard

The "Suas candidaturas" top-3 summary excludes archived applications entirely.

Status Interaction

Archiving and restoring do not change the application's status. An application archived while INTERVIEW returns to the pipeline as INTERVIEW on restore.
Status changes remain available on archived applications via the detail page (a user may update status while archived without restoring). Restoring is a separate, explicit action.

API Contract Adjustments
GET /job-applications

Add query param archived: boolean (default false).

false → active only (archivedAt IS NULL AND deletedAt IS NULL).
true → archived only (archivedAt IS NOT NULL AND deletedAt IS NULL).

deletedAt IS NOT NULL is always excluded regardless of the param.
Existing status filters apply within the chosen visibility scope.

GET /job-applications/highlights?limit=3

Always excludes archived and deleted (active only).

POST /job-applications/:id/archive

Sets archivedAt = now() for the owning user's application.
Idempotent: archiving an already-archived application is a no-op success.
Validates ownership (application.userId).

POST /job-applications/:id/restore

Clears archivedAt.
Idempotent: restoring an active application is a no-op success.
Validates ownership.

Detail and download endpoints

Must continue to serve archived applications normally (no archived guard on read or on CV download). Archived is a visibility filter for lists, not an access restriction on the resource itself.

Error Handling

Ownership violations on archive/restore return an actionable domain error for UI toast.
deletedAt-marked applications are treated as not found for all user-facing endpoints.

Testing Strategy
API tests

archive sets archivedAt; application disappears from archived=false and appears in archived=true.
restore clears archivedAt; reverse of the above.
Archive/restore are idempotent and enforce ownership.
Status is unchanged across archive and restore (e.g., INTERVIEW stays INTERVIEW).
highlights never returns archived applications.
deletedAt-marked applications never appear in any user-facing list, detail, or download response.
Status filters operate correctly within both active and archived scopes.

Web tests

Active pipeline excludes archived applications; dashboard summary excludes them too.
"Arquivadas" view lists archived applications and exposes Restaurar as primary action.
CV/analysis download actions are present and enabled in the archived view.
Archiving from the detail page sends the application to the archived view and removes it from the active pipeline (redirect or optimistic update acceptable). The active list card exposes no archive action.
No "delete" action is exposed anywhere in the UI.

Out of Scope

User-facing hard delete (handled only administratively via deletedAt).
Standalone "Meus CVs" surface and any "attach CV to application" flow.
Bulk archive/restore (single-item only for this slice).
