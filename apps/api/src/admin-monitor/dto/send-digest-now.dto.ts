import { IsString, MinLength } from "class-validator";

export class SendDigestNowDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
