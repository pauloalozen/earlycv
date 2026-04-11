import type { CvAdaptation, ResumeTemplate } from "@prisma/client";

import type { CvAdaptationResponseDto } from "./cv-adaptation-response.dto";
import { createCvAdaptationResponseDto } from "./cv-adaptation-response.dto";

export type RedeemCvAdaptationResponseDto = CvAdaptationResponseDto;

export function createRedeemCvAdaptationResponseDto(
  adaptation: CvAdaptation & {
    template: Pick<ResumeTemplate, "id" | "name" | "slug"> | null;
  },
): RedeemCvAdaptationResponseDto {
  return createCvAdaptationResponseDto(adaptation);
}
