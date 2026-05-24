export const DEDUP_FRESH_WINDOW_HOURS = 24;

export function shouldSkipDetailFetch(
  lastSeenAt: Date | null | undefined,
  now: Date,
) {
  if (!lastSeenAt) {
    return false;
  }

  const freshnessWindowMs = DEDUP_FRESH_WINDOW_HOURS * 60 * 60 * 1000;
  return now.getTime() - lastSeenAt.getTime() <= freshnessWindowMs;
}
