import { JobSourceType } from "@prisma/client";
import { IsEnum } from "class-validator";

export class StartManualAdapterRunDto {
  @IsEnum(JobSourceType)
  adapterType!: JobSourceType;
}
