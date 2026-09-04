import { SavedJobOrigin } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class SaveJobDto {
  @IsString()
  @MinLength(1)
  jobId!: string;

  // Opcional — default RADAR no service, preserva callers existentes que
  // não mandam esse campo (nunca quebra um POST /saved-jobs antigo).
  @IsOptional()
  @IsEnum(SavedJobOrigin)
  origin?: SavedJobOrigin;
}
