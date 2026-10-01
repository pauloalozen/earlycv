import type { MockInterviewSessionStatus } from "@/lib/admin-mock-interviews-api";

export function sessionTone(status: MockInterviewSessionStatus) {
  if (status === "AWAITING_SCHEDULING") return "warn" as const;
  if (status === "SCHEDULED") return "info" as const;
  if (status === "COMPLETED") return "ok" as const;
  if (status === "NO_SHOW" || status === "REFUNDED") return "danger" as const;
  return "neutral" as const;
}
