import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";

// Descadastro (MonitorAlertPreference.unsubscribedAt) não é um
// MonitorDigestEvent nem carrega provider — drill-down do card
// "Descadastros" precisa de endpoint/DTO próprio, ver comentário em
// AdminMonitorService.getDigestEmailStats.
export class ListDigestUnsubscribesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // Período sobre unsubscribedAt — mesma convenção de from/to de
  // ListDigestHistoryDto.
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
