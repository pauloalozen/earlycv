import { ArrayMaxSize, IsArray, IsOptional, IsString } from "class-validator";

export class RedeemCreditDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  selectedMissingKeywords?: string[];
}
