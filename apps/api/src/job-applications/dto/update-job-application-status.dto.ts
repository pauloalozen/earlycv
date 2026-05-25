import { IsEnum } from "class-validator";

import type { JobApplicationStatus } from "@prisma/client";

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
}
