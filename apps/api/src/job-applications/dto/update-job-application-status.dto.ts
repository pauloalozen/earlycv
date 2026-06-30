import type { JobApplicationStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateJobApplicationStatusDto {
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
  status!: JobApplicationStatus;

  @IsOptional()
  @IsString()
  currentCvAdaptationId?: string;
}
