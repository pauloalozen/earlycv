import { IsBoolean, IsOptional } from "class-validator";

// Cadência de envio não é mais escolha do usuário (agora é global, ver
// MonitorDigestScheduleConfig em /admin/alerta-vagas) — só resta o
// interruptor de e-mail.
export class UpdateAlertPreferenceDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;
}
