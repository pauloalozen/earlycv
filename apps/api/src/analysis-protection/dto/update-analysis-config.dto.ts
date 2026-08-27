import { IsDefined, IsObject, IsOptional, IsString } from "class-validator";

export class UpdateAnalysisConfigDto {
  // Sem decorator, o ValidationPipe global (whitelist + forbidNonWhitelisted,
  // ver main.ts) descarta esta propriedade como "should not exist" antes de
  // chegar no controller — bug pré-existente que quebrava toda escrita real
  // de config via este endpoint (não só guest_analysis_auth_gate_enabled),
  // encontrado ao validar o toggle end-to-end na Fase 6. @IsDefined() só
  // exige presença — o tipo real (boolean/int/string/...) é validado depois
  // por AnalysisConfigService.normalizeWriteValue, que já conhece o schema
  // de cada chave.
  @IsDefined()
  value!: unknown;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsObject()
  technicalContext?: Record<string, unknown>;
}
