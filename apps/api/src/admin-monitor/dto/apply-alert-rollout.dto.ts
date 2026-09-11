import { MonitorAlertBulkSegment } from "@prisma/client";
import { IsBoolean, IsEnum } from "class-validator";

export class ApplyAlertRolloutDto {
  @IsEnum(MonitorAlertBulkSegment)
  segment!: MonitorAlertBulkSegment;

  @IsBoolean()
  enable!: boolean;
}
