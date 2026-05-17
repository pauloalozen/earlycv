import { IngestionBatchItemStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListManualRunItemsDto {
  @IsOptional()
  @IsEnum(IngestionBatchItemStatus)
  status?: IngestionBatchItemStatus;
}
