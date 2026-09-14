import { LinkedinCurationStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsIn, IsString, IsUrl, ValidateIf } from "class-validator";

export class UpdateCurationStatusDto {
  @IsIn(Object.values(LinkedinCurationStatus))
  status!: LinkedinCurationStatus;

  // Obrigatória quando FOUND_ON_LINKEDIN, ignorada (forçada a null) pra
  // qualquer outro status — ver JobCurationService.setStatus. Validação de
  // host feita no service (linkedin.com ou subdomínio, nunca um domínio que
  // só contenha a palavra "linkedin").
  @ValidateIf((dto) => dto.status === "FOUND_ON_LINKEDIN")
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  linkedinUrl?: string;
}
