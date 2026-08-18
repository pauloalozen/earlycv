import { JobArea } from "@prisma/client";
import { IsEnum } from "class-validator";

export class ReclassifyJobDto {
  @IsEnum(JobArea)
  dominantArea!: JobArea;
}
