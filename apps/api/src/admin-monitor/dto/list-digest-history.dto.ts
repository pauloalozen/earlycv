import { EmailProviderName, MonitorDigestStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export type DigestHistorySourceFilter = "MANUAL" | "AUTOMATIC";

export class ListDigestHistoryDto {
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

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  userQuery?: string;

  @IsOptional()
  @IsIn(["MANUAL", "AUTOMATIC"])
  source?: DigestHistorySourceFilter;

  // Filtros multi-provider — todos opcionais, omitidos = sem filtro
  // (comportamento idêntico ao de antes desta migração).
  @IsOptional()
  @IsEnum(EmailProviderName)
  provider?: EmailProviderName;

  @IsOptional()
  @IsEnum(MonitorDigestStatus)
  status?: MonitorDigestStatus;

  // Período — sobre createdAt (quando o digest foi descoberto/criado, não
  // scheduledFor, que é só a chave lógica de idempotência).
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
