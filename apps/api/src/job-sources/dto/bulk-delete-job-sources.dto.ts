import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from "class-validator";

export class BulkDeleteJobSourcesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  @IsBoolean()
  removeJobs?: boolean;
}
