import { IsBoolean, IsString } from "class-validator";

export class SetAlertPreferenceDto {
  @IsString()
  userId!: string;

  @IsBoolean()
  emailEnabled!: boolean;
}
