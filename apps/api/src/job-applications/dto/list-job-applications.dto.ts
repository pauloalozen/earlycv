import type { JobApplicationStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class ListJobApplicationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum([
    "SAVED",
    "ANALYZED",
    "CV_READY",
    "APPLIED",
    "IN_PROCESS",
    "INTERVIEW",
    "ASSESSMENT",
    "OFFER",
    "HIRED",
    "REJECTED",
    "WITHDRAWN",
  ])
  status?: JobApplicationStatus;
}
