import { MonitorAlertBulkSegment } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsDate, IsEnum, IsOptional } from "class-validator";

// Só ALL/PAID fazem sentido pra política contínua (validado no service,
// não aqui — reaproveita o mesmo enum de ApplyAlertRolloutDto em vez de
// duplicar um enum quase igual só pra restringir 2 dos 4 valores).
export class UpdateAlertRolloutPolicyDto {
  @IsBoolean()
  active!: boolean;

  @IsEnum(MonitorAlertBulkSegment)
  segment!: MonitorAlertBulkSegment;

  // null/ausente = sem corte, vale indefinidamente enquanto active=true.
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  cutoffAt?: Date | null;
}
