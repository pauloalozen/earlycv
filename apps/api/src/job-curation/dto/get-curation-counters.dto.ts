import { JobArea, LinkedinCurationStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from "class-validator";

const WORK_MODELS = ["remote", "hybrid", "onsite"] as const;

// Espelha ListCurationJobsDto, exceto seniorityFilter/page/pageSize — os
// contadores por senioridade ignoram deliberadamente o próprio filtro de
// senioridade (ver JobCurationService.getSeniorityCounters), pra o admin
// trocar de faixa sem perder a distribuição completa.
export class GetCurationCountersDto {
  @IsIn(["today", "24h", "date"])
  period!: "today" | "24h" | "date";

  @ValidateIf((dto) => dto.period === "date")
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date must be in YYYY-MM-DD format",
  })
  date?: string;

  @IsOptional()
  @IsIn(Object.values(JobArea))
  areaFilter?: JobArea;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  companyFilter?: string;

  @IsOptional()
  @IsIn(WORK_MODELS)
  workModelFilter?: (typeof WORK_MODELS)[number];

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  locationFilter?: string;

  @IsOptional()
  @IsIn(Object.values(LinkedinCurationStatus))
  curationStatusFilter?: LinkedinCurationStatus;
}
