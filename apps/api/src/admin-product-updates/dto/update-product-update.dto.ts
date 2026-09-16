import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// Todo campo opcional — o service só zera testSentAt/testSentBy/
// testRecipientEmail (e reverte READY->DRAFT) quando o valor de fato muda
// em relação ao que já está salvo (ver ProductUpdatesService.updateContent).
export class UpdateProductUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  preheader?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  primaryButtonText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  primaryButtonUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  optionalFooterContent?: string;
}
