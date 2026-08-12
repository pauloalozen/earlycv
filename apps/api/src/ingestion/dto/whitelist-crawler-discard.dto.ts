import { IsString, MaxLength, MinLength } from "class-validator";

export class WhitelistCrawlerDiscardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  term!: string;
}
