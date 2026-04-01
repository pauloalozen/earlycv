import { UserStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateSuperadminStaffDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
