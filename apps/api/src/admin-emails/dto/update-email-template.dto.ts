import { IsString, MaxLength } from "class-validator";

// Limites largos de formato; as checagens que evitam e-mail quebrado
// (variáveis, tamanho, descadastro) são de validateTemplate, no salvar e no
// preview.
export class UpdateEmailTemplateDto {
  @IsString()
  @MaxLength(1000)
  subject!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;
}
