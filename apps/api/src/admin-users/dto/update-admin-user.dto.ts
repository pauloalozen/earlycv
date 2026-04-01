import { Transform } from "class-transformer";
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateAdminUserDto {
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
}
