import type { AppInternalRole } from "@/lib/app-session";

export function isJobsGhostModeEnabled() {
  return (
    process.env.JOBS_GHOST_MODE === "true" ||
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE === "true"
  );
}

export function canAccessJobsInGhostMode(
  role: AppInternalRole | null | undefined,
) {
  return role === "admin" || role === "superadmin";
}
