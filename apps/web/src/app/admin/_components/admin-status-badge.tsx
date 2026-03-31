import { Badge } from "@/components/ui";

import type { AdminStatus } from "@/lib/admin-operations";

const badgeVariantByTone = {
  danger: "outline",
  neutral: "neutral",
  success: "success",
  warning: "accent",
} as const;

type AdminStatusBadgeProps = {
  status: AdminStatus;
};

export function AdminStatusBadge({ status }: AdminStatusBadgeProps) {
  return (
    <Badge variant={badgeVariantByTone[status.tone]}>{status.label}</Badge>
  );
}
