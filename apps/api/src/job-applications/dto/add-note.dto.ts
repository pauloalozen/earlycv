import { IsString, MaxLength, MinLength } from "class-validator";

export class AddNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}
