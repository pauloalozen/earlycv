import { JobSourceType } from "@prisma/client";
import { IsBoolean, IsEnum } from "class-validator";

export class BulkUpdateScheduleDto {
  @IsEnum(JobSourceType)
  sourceType!: JobSourceType;

  @IsBoolean()
  scheduleEnabled!: boolean;
}
