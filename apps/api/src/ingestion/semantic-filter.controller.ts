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
// biome-ignore lint/style/useImportType: DTO precisa de import em runtime para reflection do NestJS ValidationPipe
import { CreateSemanticFilterConfigDto } from "./dto/create-semantic-filter-config.dto";
import { ListSkippedEnrichmentsDto } from "./dto/list-skipped-enrichments.dto";
import { SemanticFilterAdminService } from "./semantic-filter-admin.service";

const validationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("semantic-filter")
export class SemanticFilterController {
  constructor(
    @Inject(SemanticFilterAdminService)
    private readonly adminService: SemanticFilterAdminService,
  ) {}

  @Get("config")
  getActiveConfig() {
    return this.adminService.getActiveConfig();
  }

  @Post("config")
  createNewVersion(
    @Body(new ValidationPipe(validationOptions))
    dto: CreateSemanticFilterConfigDto,
  ) {
    return this.adminService.createNewVersion(dto);
  }

  @Get("skipped")
  listSkipped(
    @Query(
      new ValidationPipe({
        ...validationOptions,
        expectedType: ListSkippedEnrichmentsDto,
      }),
    )
    query: ListSkippedEnrichmentsDto,
  ) {
    return this.adminService.listSkipped(query);
  }

  @Post("skipped/:id/reenrich")
  reenrich(@Param("id") id: string) {
    return this.adminService.reenrich(id);
  }

  @Get("dashboard")
  getDashboard() {
    return this.adminService.getDashboard();
  }
}
