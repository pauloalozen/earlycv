# User Profile Canonico and Adaptation Source

## Purpose

This runbook explains how canonical profile merging and adaptation source tracking behave in API and web flows.

## Adaptation source vs input mode

- `adaptationSource` defines logical priority:
  - `uploaded_content`
  - `user_profile`
- `inputMode` defines the entry path:
  - `file_upload`
  - `text_paste`
  - `profile`

Rules:

- `file_upload` and `text_paste` map to `adaptationSource=uploaded_content`.
- `profile` maps to `adaptationSource=user_profile`.
- `profile` mode is rejected unless `profileReadinessStatus=ready`.

## Canonical profile merge behavior

Merge logic is centralized and used by adaptation and CV base flows.

- `analysis_upload` is used for upload/text analysis path.
- `base_cv_upload` is used when CV base is uploaded as master.
- `manual_edit` is set on direct profile edits.

Safety rules:

- manual fields (`manuallyEdited=true`) are not overwritten by automatic sources;
- conflicts create persisted suggestions with status `pending`;
- repeated conflicts are deduplicated for the same path/source/value;
- missing data in incoming payload does not delete existing profile data.

## Snapshot audit fields

`CvAdaptation` now stores:

- `analysisInputSnapshotJson`
- `uploadedContentSnapshotJson` (when source is uploaded content)
- `generationInputSnapshotJson`

Generation snapshot persistence is immutable-by-default:

- it is only set when currently null.

Snapshots store reference/hash/structured metadata to avoid full raw text duplication when not required.

## Readiness state

`UserProfile.profileReadinessStatus` uses:

- `empty`
- `partial`
- `ready`

Web gating behavior:

- profile mode is disabled in `/adaptar` unless status is `ready`.

## Data governance

These fields must be included in user data handling policies:

- canonical profile JSON blocks and field metadata;
- profile suggestions history;
- adaptation snapshots.

When implementing export/delete/retention routines, include these fields explicitly.
