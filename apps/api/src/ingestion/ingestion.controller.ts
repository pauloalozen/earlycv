import {
  AuthenticatedUser,
  type AuthenticatedRequestUser,
} from "../common/authenticated-user.decorator";
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
import { ManualIngestionService } from "./manual-ingestion.service";
import { ListManualRunItemsDto } from "./dto/list-manual-run-items.dto";
import { ListManualRunsDto } from "./dto/list-manual-runs.dto";
import { StartManualAdapterRunDto } from "./dto/start-manual-adapter-run.dto";
import { UpdateGlobalSchedulerDto } from "./dto/update-global-scheduler.dto";

const ingestionValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

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
    @Inject(ManualIngestionService)
    private readonly manualIngestionService: ManualIngestionService,
  ) {}

  @Get()
  list() {
    return this.ingestionService.listAllRuns();
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

  @Post("manual/adapter/:adapterType")
  @HttpCode(202)
  startManualAdapterRun(
    @Param(
      new ValidationPipe({
        ...ingestionValidationOptions,
        expectedType: StartManualAdapterRunDto,
      }),
    )
    params: StartManualAdapterRunDto,
    @AuthenticatedUser() user: AuthenticatedRequestUser,
  ) {
    return this.manualIngestionService.startAdapterRun(params.adapterType, user.id);
  }

  @Get("manual")
  listManualRuns(
    @Query(
      new ValidationPipe({
        ...ingestionValidationOptions,
        expectedType: ListManualRunsDto,
      }),
    )
    query: ListManualRunsDto,
  ) {
    return this.manualIngestionService.listRuns(query);
  }

  @Get("manual/:batchRunId")
  getManualRunById(@Param("batchRunId") batchRunId: string) {
    return this.manualIngestionService.getRunById(batchRunId);
  }

  @Get("manual/:batchRunId/items")
  listManualRunItems(
    @Param("batchRunId") batchRunId: string,
    @Query(
      new ValidationPipe({
        ...ingestionValidationOptions,
        expectedType: ListManualRunItemsDto,
      }),
    )
    query: ListManualRunItemsDto,
  ) {
    return this.manualIngestionService.listRunItems(batchRunId, query);
  }

  @Post("manual/:batchRunId/cancel")
  cancelManualRun(@Param("batchRunId") batchRunId: string) {
    return this.manualIngestionService.cancel(batchRunId);
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.ingestionService.getRunById(id);
  }
}
