import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
} from "class-validator";

const MODES = ["OFF", "SHADOW", "ALLOWLIST", "LIVE"] as const;
type Mode = (typeof MODES)[number];

// Regras de negócio (cutoff obrigatório, ALLOWLIST não vazia, LIVE confirmado,
// e-mails válidos) ficam em EmailDispatchSettingsService.validate — aqui só o
// formato do corpo.
export class UpdateEmailSettingsDto {
  @IsIn(MODES)
  welcomeMode!: Mode;

  @IsIn(MODES)
  feedbackMode!: Mode;

  // Opcional: ausente = mantém o modo atual (clientes antigos).
  @IsOptional()
  @IsIn(MODES)
  feedbackSecondCallMode?: Mode;

  @IsIn(MODES)
  purchaseConfirmationMode!: Mode;

  // ISO 8601 ou null (sem cutoff).
  @ValidateIf((_, value) => value !== null)
  @IsString()
  startAt!: string | null;

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  allowlist!: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  extraBlocklist!: string[];

  @IsOptional()
  @IsBoolean()
  confirmLive?: boolean;
}
