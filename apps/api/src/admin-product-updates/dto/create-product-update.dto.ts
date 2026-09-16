import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { IsSafeButtonUrl } from "./is-safe-button-url.decorator";

export class CreateProductUpdateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  internalName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  preheader?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  primaryButtonText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @IsSafeButtonUrl()
  primaryButtonUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  optionalFooterContent?: string;
}
