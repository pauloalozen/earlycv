import {
  JobArea,
  LinkedinCurationStatus,
  SeniorityLevel,
} from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

const WORK_MODELS = ["remote", "hybrid", "onsite"] as const;

export class ListCurationJobsDto {
  @IsIn(["today", "24h", "date"])
  period!: "today" | "24h" | "date";

  // Obrigatório só quando period="date" — validado aqui pra dar erro 400
  // cedo em vez de deixar o service interpretar undefined.
  @ValidateIf((dto) => dto.period === "date")
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date must be in YYYY-MM-DD format",
  })
  date?: string;

  @IsOptional()
  @IsIn(Object.values(SeniorityLevel))
  seniorityFilter?: SeniorityLevel;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
