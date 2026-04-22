import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateAnalysisConfigDto {
  value!: unknown;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsObject()
  technicalContext?: Record<string, unknown>;
}
