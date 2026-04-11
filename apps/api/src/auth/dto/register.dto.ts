import { Transform } from "class-transformer";
import { IsEmail, IsString, Matches, MinLength } from "class-validator";

import {
  USER_PASSWORD_POLICY_MESSAGE,
  USER_PASSWORD_POLICY_REGEX,
} from "./password-policy";

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(USER_PASSWORD_POLICY_REGEX, {
    message: USER_PASSWORD_POLICY_MESSAGE,
  })
  password!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  name!: string;
}
