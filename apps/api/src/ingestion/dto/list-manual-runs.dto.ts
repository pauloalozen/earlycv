import { IngestionBatchRunStatus, IngestionBatchScopeType } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListManualRunsDto {
  @IsOptional()
  @IsEnum(IngestionBatchRunStatus)
  status?: IngestionBatchRunStatus;

  @IsOptional()
  @IsEnum(IngestionBatchScopeType)
  scopeType?: IngestionBatchScopeType;
}
