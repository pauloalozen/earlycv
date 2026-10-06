import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

import { MOCK_INTERVIEW_SESSION_STATUSES } from "./admin-list-query.dto";

// null explícito limpa o campo; ausência mantém.
export class AdminUpdateMockInterviewDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  meetingUrl?: string | null;

  @IsOptional()
  @IsIn(MOCK_INTERVIEW_SESSION_STATUSES)
  sessionStatus?: (typeof MOCK_INTERVIEW_SESSION_STATUSES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  adminNotes?: string | null;

  @IsOptional()
  @IsBoolean()
  reportSent?: boolean;
}
