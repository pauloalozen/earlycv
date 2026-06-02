# Master CV Canonical Extraction — Operational Runbook

## Objective

Operate and troubleshoot the async canonical extraction flow triggered from Master CV uploads, with focus on queue backlog, retries/poison messages, and safe rollback.

## Scope

- API slice: `apps/api/src/master-cv-canonical-extraction`
- Upload trigger: `apps/api/src/resumes/resumes.service.ts`
- Persistence model: `MasterCvCanonicalExtraction`
- Main statuses: `pending`, `processing`, `succeeded`, `failed`

## Daily Checks

1. **Backlog health**
   - Check count of stale pending jobs (older than 15 min).
   - Check count of processing jobs (older than 15 min).
2. **Failure rate**
   - Check `failed` jobs created in the last 24h.
   - Review `lastError` top occurrences.
3. **Latency sanity**
   - Spot-check `startedAt` -> `finishedAt` for recent succeeded jobs.

## Suggested SQL Queries

```sql
-- Pending backlog older than 15 minutes
select count(*) as pending_old
from "MasterCvCanonicalExtraction"
where status = 'pending'
  and "createdAt" < now() - interval '15 minutes';

-- Processing jobs older than 15 minutes (potentially stuck)
select count(*) as processing_old
from "MasterCvCanonicalExtraction"
where status = 'processing'
  and "updatedAt" < now() - interval '15 minutes';

-- Failures in last 24h
select count(*) as failed_24h
from "MasterCvCanonicalExtraction"
where status = 'failed'
  and "updatedAt" >= now() - interval '24 hours';

-- Top error signatures in last 24h
select coalesce("lastError", 'n/a') as last_error, count(*) as total
from "MasterCvCanonicalExtraction"
where status = 'failed'
  and "updatedAt" >= now() - interval '24 hours'
group by 1
order by total desc
limit 20;
```

## Retry and Poison Message Handling

### Current Retry Policy

- Worker retries transient errors up to **3 attempts**.
- Transient signatures include: timeout, network instability, rate-limit style errors.
- Permanent errors (schema/validation, deterministic bad payload) fail fast.

### Operator Playbook

1. Identify high-volume failed items with same `lastError`.
2. Split by category:
   - **Transient** (`timeout`, `network`, `rate limit`): eligible for replay.
   - **Permanent** (`validation`, malformed payload): do not blind-retry.
3. For transient bursts:
   - Verify external provider status and credentials.
   - Replay a small sample first.
4. For permanent failures:
   - Capture 3-5 samples with `resumeId`, `inputHash`, `lastError`.
   - Open engineering follow-up with payload examples.

### Replay Query (manual)

```sql
-- Mark failed transient jobs back to pending for controlled replay
update "MasterCvCanonicalExtraction"
set status = 'pending',
    "lastError" = null,
    "finishedAt" = null
where status = 'failed'
  and "lastError" ilike '%timeout%'
  and "updatedAt" >= now() - interval '2 hours';
```

> Run replay in small batches. Validate success ratio before wider replay.

## Direct-Production Rollback

This rollout follows a **direct production cutover** strategy (no feature flag gating).

### Emergency Rollback Steps

1. Pause queue consumption for master CV extraction (or temporarily disable worker bootstrapping via deploy rollback).
2. Roll back API deployment to the last stable release.
3. Confirm Master CV uploads remain operational (resume persistence intact) after rollback.
4. Keep monitoring existing pending/processing rows until the system stabilizes.
5. Publish incident note with:
   - start/end time,
   - affected period,
   - primary error signature,
   - mitigation and next action.

## Incident Classification

- **SEV-2**: sustained upload degradation or widespread extraction failure spike.
- **SEV-3**: isolated extraction failures with healthy upload path.

## Exit Criteria After Incident

- Pending backlog returns to baseline.
- Failed ratio normalizes for 24h window.
- No stuck `processing` jobs older than 15 min.
- Postmortem includes root cause and prevention action.
