import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const CAMPAIGN_STATUSES = ["draft", "active", "inactive"] as const;
const REWARD_TYPES = ["percentage", "fixed_amount"] as const;
const CREDIT_BONUS_TYPES = ["multiplier", "fixed_extra"] as const;
const PLAN_IDS = ["starter", "pro", "turbo"] as const;

export class UpsertAffiliateCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: (typeof CAMPAIGN_STATUSES)[number];

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsArray()
  @ArrayMinSize(1, {
    message: "Escolha ao menos um plano elegível para a campanha.",
  })
  @IsIn(PLAN_IDS, { each: true })
  eligiblePlanIds!: (typeof PLAN_IDS)[number][];

  @IsOptional()
  @IsIn(REWARD_TYPES)
  defaultDiscountType?: (typeof REWARD_TYPES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultDiscountValue?: number;

  @IsOptional()
  @IsIn(CREDIT_BONUS_TYPES)
  creditBonusType?: (typeof CREDIT_BONUS_TYPES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  creditBonusValue?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  partnershipCostInCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  freeRedemptionPerUserLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  freeRedemptionLimitTotal?: number;
}
