import { UserPlanType } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateAdminUserPlanDto {
  @IsEnum(UserPlanType)
  planType!: UserPlanType;
}
