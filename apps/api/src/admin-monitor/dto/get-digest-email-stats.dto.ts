import { EmailProviderName } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class GetDigestEmailStatsDto {
  // Janela do resumo (processados/aceitos/entregues/etc. e taxas) — default
  // 1 (24h, mesmo comportamento de antes desta migração) quando omitido.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  periodDays?: number;

  // Filtra o resumo por provider — omitido, agrega os dois. byStatus/
  // byProvider continuam sendo o breakdown DO conjunto já filtrado.
  @IsOptional()
  @IsEnum(EmailProviderName)
  provider?: EmailProviderName;
}
