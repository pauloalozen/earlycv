import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

export class GetMockInterviewPurchaseQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  refresh?: boolean;
}
