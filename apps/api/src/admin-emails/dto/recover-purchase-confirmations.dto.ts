import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class RecoverPurchaseConfirmationsDto {
  // Janela em horas (padrão 24, máx. 72 — acima disso o recibo chegaria tão
  // atrasado que não vale mais enviar).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(72)
  sinceHours?: number;
}
