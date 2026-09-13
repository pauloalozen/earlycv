import {
  MonitorAlertBulkSegment,
  MonitorDigestFrequency,
} from "@prisma/client";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateDigestScheduleDto {
  // Cadência global de todos os usuários — antes era escolha individual
  // (MonitorAlertPreference.frequency, removido), agora é decisão do
  // admin pra controlar o volume de e-mail no agregado.
  @IsEnum(MonitorDigestFrequency)
  frequency!: MonitorDigestFrequency;

  // Horário de envio — vale pra qualquer cadência, não só DAILY.
  @IsInt()
  @Min(0)
  @Max(23)
  dailyHour!: number;

  @IsInt()
  @Min(0)
  @Max(59)
  dailyMinute!: number;

  // 0=domingo..6=sábado (mesma convenção de Date.prototype.getUTCDay()).
  // Só relevante quando frequency=WEEKLY.
  @IsInt()
  @Min(0)
  @Max(6)
  weeklyDayOfWeek!: number;

  // Coorte controlada do rollout SES do digest (JOB_ALERT) — ver
  // MonitorDigestScheduleConfig.sesRolloutSegment no schema. Omitido =
  // não muda (semântica de update do Prisma); enviado como null =
  // desliga a coorte de propósito (ninguém recebe via SES). Nada disto
  // afeta a cadência em si (frequency/dailyHour/etc acima).
  @IsOptional()
  @IsEnum(MonitorAlertBulkSegment)
  sesRolloutSegment?: MonitorAlertBulkSegment | null;
}
