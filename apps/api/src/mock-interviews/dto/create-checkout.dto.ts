import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export const MOCK_INTERVIEW_ORIGINS = [
  "landing",
  "application_offer",
  "offer_email",
  "showcase",
  "other",
] as const;

export class CreateMockInterviewCheckoutDto {
  @IsBoolean()
  acceptPolicy!: boolean;

  @IsOptional()
  @IsIn(MOCK_INTERVIEW_ORIGINS)
  origin?: (typeof MOCK_INTERVIEW_ORIGINS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  jobApplicationId?: string;
}
