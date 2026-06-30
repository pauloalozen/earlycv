import { IsOptional, IsString, MaxLength } from "class-validator";

export class RejectionFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionStrengths?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionImprovements?: string;
}
