import { IsString, Matches, MinLength } from "class-validator";

import {
  USER_PASSWORD_POLICY_MESSAGE,
  USER_PASSWORD_POLICY_REGEX,
} from "./password-policy";

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @Matches(USER_PASSWORD_POLICY_REGEX, {
    message: USER_PASSWORD_POLICY_MESSAGE,
  })
  newPassword!: string;
}
