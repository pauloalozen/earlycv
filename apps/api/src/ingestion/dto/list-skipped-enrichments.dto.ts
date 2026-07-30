import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListSkippedEnrichmentsDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(["zona_cinza", "noise_signal", "tech_signal"])
  reasonKind?: "zona_cinza" | "noise_signal" | "tech_signal";

  @IsOptional()
  @IsString()
  sourceName?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
