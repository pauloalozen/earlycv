import { MonitorDigestFrequency } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional } from "class-validator";

export class UpdateAlertPreferenceDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsEnum(MonitorDigestFrequency)
  frequency?: MonitorDigestFrequency;
}
