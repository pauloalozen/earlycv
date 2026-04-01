import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class CreateStaffUserDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsIn(["admin", "superadmin"] as const)
  internalRole!: "admin" | "superadmin";
}
