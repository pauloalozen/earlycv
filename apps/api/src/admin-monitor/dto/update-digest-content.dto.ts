import { IsString, MaxLength, MinLength } from "class-validator";

export class UpdateDigestContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  // Vazio é um valor válido de propósito — "sem introdução" é o default
  // (ver migration seed) e continua uma escolha legítima do admin.
  @IsString()
  @MaxLength(2000)
  introText!: string;
}
