import { IsBoolean, IsIn, IsOptional } from "class-validator";

export class PreviewProductUpdateDto {
  @IsOptional()
  @IsIn(["desktop", "mobile"])
  viewport?: "desktop" | "mobile";

  @IsOptional()
  @IsBoolean()
  withName?: boolean;
}
