import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListTrackedAlertUsersDto {
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

  // Busca por e-mail ou nome dentro dos usuários já rastreados (que têm
  // MonitorAlertPreference) — nunca sobre a base inteira, ver
  // AdminMonitorService.listTrackedAlertUsers.
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  query?: string;
}
