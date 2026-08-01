import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CrawlerDiscardService } from "./crawler-discard.service";
import { ListCrawlerDiscardsDto } from "./dto/list-crawler-discards.dto";
// biome-ignore lint/style/useImportType: DTO precisa de import em runtime para reflection do NestJS ValidationPipe
import { WhitelistCrawlerDiscardDto } from "./dto/whitelist-crawler-discard.dto";

const validationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("ingestion/crawler-discards")
export class CrawlerDiscardController {
  constructor(
    @Inject(CrawlerDiscardService)
    private readonly crawlerDiscardService: CrawlerDiscardService,
  ) {}

  @Get()
  list(
    @Query(
      new ValidationPipe({
        ...validationOptions,
        expectedType: ListCrawlerDiscardsDto,
      }),
    )
    query: ListCrawlerDiscardsDto,
  ) {
    return this.crawlerDiscardService.list(query);
  }

  @Get("count")
  getCount() {
    return this.crawlerDiscardService.getDiscardedCount();
  }

  @Post(":id/whitelist")
  whitelist(
    @Param("id") id: string,
    @Body(new ValidationPipe(validationOptions))
    dto: WhitelistCrawlerDiscardDto,
  ) {
    return this.crawlerDiscardService.whitelist(id, dto.term);
  }
}
