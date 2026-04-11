import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class SetAdminUserCreditsDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditsRemaining!: number;
}
