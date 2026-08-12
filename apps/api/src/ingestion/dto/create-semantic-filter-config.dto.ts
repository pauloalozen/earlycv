import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateSemanticFilterConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500)
  noiseSignals!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500)
  techSignals!: string[];
}
