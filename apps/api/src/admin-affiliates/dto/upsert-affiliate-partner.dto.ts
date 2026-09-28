import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

const PARTNER_STATUSES = ["draft", "active", "inactive"] as const;

export class UpsertAffiliatePartnerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  slug!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(PARTNER_STATUSES)
  status?: (typeof PARTNER_STATUSES)[number];
}
