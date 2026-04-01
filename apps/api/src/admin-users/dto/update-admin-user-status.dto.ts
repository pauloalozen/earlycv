import { UserStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateAdminUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
