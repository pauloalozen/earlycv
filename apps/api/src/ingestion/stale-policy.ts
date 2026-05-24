export const STALE_THRESHOLD_DAYS = 7;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getStaleCutoff(now: Date) {
  return new Date(now.getTime() - STALE_THRESHOLD_DAYS * DAY_IN_MS);
}

export function shouldMarkJobAsStale(job: { lastSeenAt: Date }, cutoff: Date) {
  return job.lastSeenAt.getTime() < cutoff.getTime();
}
