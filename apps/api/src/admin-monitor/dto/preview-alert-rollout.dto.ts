import { MonitorAlertBulkSegment } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum } from "class-validator";

export class PreviewAlertRolloutDto {
  @IsEnum(MonitorAlertBulkSegment)
  segment!: MonitorAlertBulkSegment;

  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  enable!: boolean;
}
