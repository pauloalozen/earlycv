import { IsString, MinLength } from "class-validator";

export class SaveJobDto {
  @IsString()
  @MinLength(1)
  jobId!: string;
}
