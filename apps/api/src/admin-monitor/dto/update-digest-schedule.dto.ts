import {
  EmailBulkSendMode,
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

  // Modo operacional do envio em massa do digest — ver
  // MonitorDigestScheduleConfig.sesMode no schema. Omitido = não muda.
  // Default de deploy é LEGACY_RESEND (preserva produção atual); trocar
  // pra SES_ROLLOUT/SES_LIVE é decisão explícita do admin, depois que
  // AWS/SNS/webhook estiverem prontos.
  @IsOptional()
  @IsEnum(EmailBulkSendMode)
  sesMode?: EmailBulkSendMode;

  // Coorte controlada do rollout SES do digest (JOB_ALERT) — só relevante
  // quando sesMode=SES_ROLLOUT (ver MonitorDigestScheduleConfig.
  // sesRolloutSegment no schema). Omitido = não muda (semântica de update
  // do Prisma); enviado como null = desliga a coorte de propósito
  // (ninguém entra ainda). Nada disto afeta a cadência em si
  // (frequency/dailyHour/etc acima).
  @IsOptional()
  @IsEnum(MonitorAlertBulkSegment)
  sesRolloutSegment?: MonitorAlertBulkSegment | null;
}
