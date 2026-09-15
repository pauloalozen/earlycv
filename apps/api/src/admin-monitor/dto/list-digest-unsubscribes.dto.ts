import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";

// Descadastro (MonitorAlertPreference.unsubscribedAt) não é um
// MonitorDigestEvent nem carrega provider — drill-down do card
// "Descadastros" precisa de endpoint/DTO próprio, ver comentário em
// AdminMonitorService.getDigestEmailStats.
export type DigestUnsubscribeReasonFilter =
  | "USER_UNSUBSCRIBED"
  | "BOUNCED"
  | "COMPLAINED"
  // Drill-down do card "Suprimidos (bounce/complaint)" — os dois motivos
  // automáticos juntos, distintos do unsubscribe voluntário.
  | "SUPPRESSED";

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

  @IsOptional()
  @IsIn(["USER_UNSUBSCRIBED", "BOUNCED", "COMPLAINED", "SUPPRESSED"])
  reason?: DigestUnsubscribeReasonFilter;
}
