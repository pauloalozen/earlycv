import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Min } from "class-validator";

export class UpdateEnrichmentConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  enrichmentBatchSize?: number;

  @IsOptional()
  @IsString()
  enrichmentCronExpression?: string;

  @IsOptional()
  @IsBoolean()
  enrichmentEnabled?: boolean;
}
