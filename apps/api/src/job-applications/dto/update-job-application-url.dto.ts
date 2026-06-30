import { IsUrl } from "class-validator";

export class UpdateJobApplicationUrlDto {
  @IsUrl({}, { message: "jobUrl deve ser uma URL válida" })
  jobUrl!: string;
}
