# Job Ingestion Crawler Design

## Context

The backend already persists `Company`, `JobSource`, `Job`, and `IngestionRun`. The next product-critical slice is real vacancy ingestion from employer portals, with stable deduplication by `canonicalKey`, preserved `firstSeenAt`, and operational visibility for admins.

The product direction is not to ingest every vacancy from every source. Admin users must be able to configure what each source should capture so the system focuses on technology, data, product, analytics/BI, and adjacent digital roles instead of operational or field-heavy vacancies.

The first real crawler slice will target dedicated adapters for `gupy` and `greenhouse`.

## Goals

- Build real ingestion for `gupy` and `greenhouse` job sources.
- Fetch both listing data and full job detail in the first slice.
- Persist accepted vacancies into `Job` using stable `canonicalKey` and `firstSeenAt` rules.
- Allow admins to configure capture rules per `JobSource` to include relevant digital roles and exclude operational roles.
- Record audited ingestion run metrics for discovered, accepted, filtered, and failed vacancies.
- Keep the design extensible for future adapters like `lever` and `workday`.

## Non-Goals

- Supporting every job portal in the first slice.
- Building a generic CSS-selector crawler first.
- Reclassifying historical jobs after capture rules change.
- Delivering recurring scheduling in the same slice if manual execution already validates the ingestion core.
- Replacing the web jobs mock before ingestion data is trustworthy.

## Recommended Approach

Use a shared ingestion pipeline with source-specific adapters.

Each adapter is responsible for fetching remote listing data and job detail data for one source type. A shared orchestration layer handles normalization, capture-rule filtering, deduplication, persistence, and run accounting. This keeps source-specific scraping logic isolated while preserving one consistent product model for `Job`, `IngestionRun`, and admin operations.

The first adapters should be:

- `gupy`
- `greenhouse`

## Product Rules

### Job Identity

- `canonicalKey` remains the main identity signal for deduplication.
- `firstSeenAt` is set only when the job is first accepted into the database.
- Later sightings update freshness fields like `lastSeenAt`, but never move `firstSeenAt` forward or backward.

### Capture Scope

- The system does not ingest every discovered vacancy by default.
- Each `JobSource` has a capture policy controlled by the admin.
- Vacancies rejected by the capture policy do not become `Job` records.
- Rejected vacancies still count in ingestion run metrics so admins can calibrate filters.

### Filtering Priority

When a source has capture rules:

1. exclusion matches reject first
2. if inclusion rules exist, a vacancy must match at least one inclusion rule
3. if no inclusion rules exist, the vacancy is accepted unless excluded

Matching should use normalized text from:

- title
- department or area when provided by the source
- full job description text

## Architecture

### Adapter Interface

Create a common adapter contract for source-specific crawlers. Each adapter should expose methods conceptually equivalent to:

- `discoverJobs(source)`
- `fetchJobDetail(source, discoveredJob)`
- `buildCanonicalKey(source, normalizedJob)`

The orchestration layer selects the adapter by `JobSource.sourceType`.

### Shared Pipeline

For each ingestion execution:

1. load `JobSource` and `Company`
2. select adapter from source type
3. discover vacancies from the remote source
4. fetch detail for each discovered vacancy
5. normalize to a shared internal job shape
6. apply capture policy
7. upsert accepted jobs by `canonicalKey`
8. finalize run metrics and status

This pipeline should be reusable for manual execution now and scheduled execution later.

### Normalized Internal Shape

Before persistence, adapters should produce a normalized job payload that contains at least:

- title
- source job URL
- source job id if available
- company name
- department/area if available
- location text
- remote/hybrid/onsite hints if available
- employment type if available
- description text
- published/opening timestamps if available
- raw source payload snapshot for traceability when helpful

This normalized shape is the input for filtering and persistence.

## Data Model Changes

### JobSource Capture Configuration

Add capture configuration to `JobSource`, preferably as structured JSON rather than many narrow columns. A field like `captureRulesJson` should support:

- `includeKeywords: string[]`
- `excludeKeywords: string[]`
- `includeDepartments: string[]`
- `excludeDepartments: string[]`
- `notes?: string`

This keeps the first slice flexible and avoids schema churn every time operations want a new filter nuance.

### IngestionRun Metrics

Extend `IngestionRun` so runs can explain what happened operationally. Add counters and summary data such as:

- `discoveredCount`
- `acceptedCount`
- `filteredOutCount`
- `failedCount`
- `summaryJson`

`summaryJson` can hold small sampled examples of filtered-out jobs and fetch failures for admin troubleshooting.

## Adapter Details

### Gupy Adapter

The `gupy` adapter should:

- fetch the company openings list from the real Gupy endpoint/page flow
- extract listing-level metadata and job URLs/ids
- fetch each job detail page or endpoint
- normalize fields into the shared internal job shape
- build a stable `canonicalKey` based on source type, source identifier, and remote job identity

### Greenhouse Adapter

The `greenhouse` adapter should:

- fetch the public Greenhouse board postings feed/listing
- extract listing metadata and posting identifiers
- fetch full detail when the board feed does not already contain enough content
- normalize fields into the shared internal job shape
- build a stable `canonicalKey` from source type, board identity, and posting identity

## Admin Experience

### Job Source Configuration

In the admin source detail/edit flow, add a new section for capture policy. Admins must be able to:

- define include keywords
- define exclude keywords
- define include departments
- define exclude departments
- save and update the policy without code changes

Example for Suzano:

- include keywords: `dados`, `tecnologia`, `ti`, `analytics`, `produto`
- exclude keywords: `operador`, `manutencao`, `florestal`, `producao`, `logistica`, `campo`

### Run Feedback

Manual execution must surface enough run feedback for calibration. The admin should be able to see:

- how many jobs were discovered
- how many were accepted
- how many were filtered out
- how many failed
- sampled reasons/examples from filtered or failed items

## Persistence Rules

### Accepted Jobs

Accepted jobs are upserted into `Job`.

- new accepted job -> create with `firstSeenAt = now seen in source`
- previously accepted known job -> update mutable fields and refresh `lastSeenAt`
- if the remote source no longer returns a previously known accepted job -> mark according to current inactive/removed lifecycle rules

### Filtered Jobs

Filtered jobs are not persisted as `Job` in the first slice.

This keeps the product database focused on relevant roles and avoids filling `Job` with noise that would later need downstream exclusion logic everywhere.

## Error Handling

- adapter not implemented for source type -> fail run with explicit reason
- partial fetch failures -> continue run, count failures, and capture samples in summary
- malformed remote payload -> count failure, preserve sample context where safe
- missing capture config -> treat as open capture unless explicit business rule says otherwise
- duplicate or unstable canonical identity -> fail loudly in tests and log enough evidence to debug the adapter

## Testing Strategy

Implementation must follow TDD.

Coverage should include:

- adapter tests for `gupy` normalization from real-like fixtures
- adapter tests for `greenhouse` normalization from real-like fixtures
- capture-rule engine tests for include/exclude matching behavior
- ingestion service tests for discovered/accepted/filtered/failed counters
- persistence tests verifying stable `canonicalKey` and preserved `firstSeenAt`
- admin API tests for saving and reading capture policy on `JobSource`
- controller/service tests for manual run execution through the current admin surface

Fixtures should be close to real remote payloads while remaining safe to store in the repository.

## Risks And Mitigations

### Risk: Public portal payloads change often

Mitigation: isolate remote parsing inside adapters and keep fixtures that document expected payload shape.

### Risk: Keyword filters are too weak for ambiguous role names

Mitigation: use both title and department/description matching from day one and expose sampled filtered examples in runs.

### Risk: Canonical keys drift when adapters change

Mitigation: centralize canonical key generation and lock it with adapter tests.

### Risk: Over-ingestion of operational roles despite filters

Mitigation: exclusion-first matching and admin-adjustable policies per source.

## Success Criteria

- Admins can configure capture policy per `JobSource` without code changes.
- Manual ingestion runs work against real `gupy` and `greenhouse` sources.
- Accepted digital-role vacancies are persisted into `Job` with stable `canonicalKey` and `firstSeenAt`.
- Operationally irrelevant vacancies are filtered before persistence and reflected in run metrics.
- Runs expose enough counters and samples for admins to calibrate source policies.
- The architecture is ready to add future adapters without rewriting the pipeline.
