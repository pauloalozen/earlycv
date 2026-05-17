import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminIngestionImportService } from "./admin-ingestion-import.service";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { IngestionService } from "./ingestion.service";
import { UpdateGlobalSchedulerDto } from "./dto/update-global-scheduler.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("runs")
export class IngestionController {
  constructor(
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
    @Inject(AdminIngestionImportService)
    private readonly importService: AdminIngestionImportService,
    @Inject(GlobalSchedulerConfigService)
    private readonly globalSchedulerConfigService: GlobalSchedulerConfigService,
    @Inject(IngestionSchedulerService)
    private readonly ingestionSchedulerService: IngestionSchedulerService,
  ) {}

  @Get()
  list() {
    return this.ingestionService.listAllRuns();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.ingestionService.getRunById(id);
  }

  @Post("import-csv")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file"))
  importCsv(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query("dryRun") dryRunParam: string | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException("file is required");
    }

    return this.importService.importCompanySourcesCsv({
      csvText: file.buffer.toString("utf8"),
      dryRun: dryRunParam !== "false",
    });
  }

  @Get("scheduler/global")
  getGlobalSchedulerConfig() {
    return this.globalSchedulerConfigService.getConfig();
  }

  @Put("scheduler/global")
  updateGlobalSchedulerConfig(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateGlobalSchedulerDto,
  ) {
    return this.globalSchedulerConfigService.updateConfig(dto);
  }

  @Post("scheduler/global/run")
  @HttpCode(200)
  runGlobalSchedulerNow() {
    return this.ingestionSchedulerService.runGlobalNow();
  }
}
