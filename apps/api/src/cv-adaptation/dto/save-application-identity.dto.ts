import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export class SaveApplicationIdentityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  jobTitle!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  companyName!: string;
}
