import { IngestionBatchItemStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";

export class ListManualRunItemsDto {
  @IsOptional()
  @IsEnum(IngestionBatchItemStatus)
  status?: IngestionBatchItemStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
