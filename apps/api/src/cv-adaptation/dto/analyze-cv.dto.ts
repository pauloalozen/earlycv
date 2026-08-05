import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class AnalyzeCvDto {
  @IsOptional()
  @IsIn(["file_upload", "text_paste", "profile"])
  inputMode?: "file_upload" | "text_paste" | "profile";

  @IsOptional()
  @IsString()
  masterResumeId?: string;

  // Obrigatório salvo quando radarJobId é enviado — nesse caso o service
  // resolve o texto a partir de Job.descriptionClean antes de qualquer
  // validação (ver resolveAnalysisJobDescription em cv-adaptation.service).
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  jobDescriptionText?: string;

  // Id de Job do Radar de Oportunidades — usado só quando jobDescriptionText
  // não veio preenchido (fluxo de 1 clique a partir de /vagas). Nome
  // deliberadamente diferente de "jobId" pra não colidir com o jobId do
  // AnalysisJob assíncrono devolvido por startAuthenticatedAnalysisJob.
  @IsOptional()
  @IsString()
  radarJobId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  masterCvText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  turnstileToken?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  saveAsMaster?: boolean;
}
