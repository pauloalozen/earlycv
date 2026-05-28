import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreatePlanCheckoutDto {
  @IsIn(["starter", "pro", "turbo"])
  planId!: "starter" | "pro" | "turbo";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  adaptationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  selectedMissingKeywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  gaClientId?: string;
}
