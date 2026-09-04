import {
  RecommendationFeedback,
  RecommendationFeedbackReason,
} from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class RecommendationFeedbackDto {
  @IsEnum(RecommendationFeedback)
  feedback!: RecommendationFeedback;

  @IsOptional()
  @IsEnum(RecommendationFeedbackReason)
  feedbackReason?: RecommendationFeedbackReason;
}
