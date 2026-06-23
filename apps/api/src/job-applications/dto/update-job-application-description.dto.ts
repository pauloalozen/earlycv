import { IsString, MaxLength, MinLength } from "class-validator";

export class UpdateJobApplicationDescriptionDto {
  @IsString()
  @MinLength(1, { message: "jobDescriptionText não pode ser vazio" })
  @MaxLength(12000, {
    message: "jobDescriptionText não pode ter mais de 12000 caracteres",
  })
  jobDescriptionText!: string;
}
