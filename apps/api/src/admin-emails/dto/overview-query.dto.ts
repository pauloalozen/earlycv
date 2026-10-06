import { IsIn, IsOptional, IsString, Matches } from "class-validator";

import { EMAIL_PERIODS, type EmailPeriod } from "../email-period";

export class EmailsOverviewQueryDto {
  @IsOptional()
  @IsIn(EMAIL_PERIODS)
  period?: EmailPeriod;

  // Dia de calendário (America/Sao_Paulo), inclusivo. A coerência entre os
  // dois (from <= to, máx. 366 dias) é validada em resolveEmailWindow.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
