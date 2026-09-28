import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

const CODE_STATUSES = ["draft", "active", "inactive"] as const;

export class UpsertAffiliateCodeDto {
  @IsString()
  campaignId!: string;

  @IsString()
  partnerId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  landingPageUrl?: string;

  @IsOptional()
  @IsIn(CODE_STATUSES)
  status?: (typeof CODE_STATUSES)[number];
}
