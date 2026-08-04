import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CreateIngestionJobDto } from "./dto/create-ingestion-job.dto";
import { ListIngestionJobRunsDto } from "./dto/list-ingestion-job-runs.dto";
import { UpdateIngestionJobDto } from "./dto/update-ingestion-job.dto";
import { IngestionJobService } from "./ingestion-job.service";

const validationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("ingestion/jobs")
export class IngestionJobController {
  constructor(
    @Inject(IngestionJobService)
    private readonly ingestionJobService: IngestionJobService,
  ) {}

  @Get()
  findAll() {
    return this.ingestionJobService.findAll();
  }

  @Post()
  create(
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: CreateIngestionJobDto,
      }),
    )
    dto: CreateIngestionJobDto,
  ) {
    return this.ingestionJobService.create(dto);
  }

  // Historico agregado de todos os jobs, usado pela secao inferior da
  // aba Jobs no admin. Precisa vir antes de ":id" para nao colidir com
  // a rota de detalhe.
  @Get("runs")
  listAllRuns(
    @Query(
      new ValidationPipe({
        ...validationOptions,
        expectedType: ListIngestionJobRunsDto,
      }),
    )
    query: ListIngestionJobRunsDto,
  ) {
    return this.ingestionJobService.listRuns(query);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.ingestionJobService.findById(id);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: UpdateIngestionJobDto,
      }),
    )
    dto: UpdateIngestionJobDto,
  ) {
    return this.ingestionJobService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(200)
  remove(@Param("id") id: string) {
    return this.ingestionJobService.remove(id);
  }

  @Post(":id/toggle")
  toggle(@Param("id") id: string) {
    return this.ingestionJobService.toggle(id);
  }

  @Post(":id/run-now")
  @HttpCode(202)
  runNow(@Param("id") id: string) {
    return this.ingestionJobService.runNow(id);
  }

  @Get(":id/runs")
  getRuns(
    @Param("id") id: string,
    @Query(
      new ValidationPipe({
        ...validationOptions,
        expectedType: ListIngestionJobRunsDto,
      }),
    )
    query: ListIngestionJobRunsDto,
  ) {
    return this.ingestionJobService.getRuns(id, query);
  }
}
