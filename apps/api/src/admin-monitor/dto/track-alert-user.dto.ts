import { IsString, MinLength } from "class-validator";

export class TrackAlertUserDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
