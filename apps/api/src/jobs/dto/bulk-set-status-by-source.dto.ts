import { JobStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class BulkSetStatusBySourceDto {
  @IsEnum(JobStatus)
  status!: JobStatus;
}
