import { JobSourceType } from "@prisma/client";
import { IsBoolean, IsEnum } from "class-validator";

export class BulkUpdateActiveDto {
  @IsEnum(JobSourceType)
  sourceType!: JobSourceType;

  @IsBoolean()
  isActive!: boolean;
}
