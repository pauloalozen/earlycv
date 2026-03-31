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
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { IngestionService } from "../ingestion/ingestion.service";
import { CreateJobSourceDto } from "./dto/create-job-source.dto";
import { UpdateJobSourceDto } from "./dto/update-job-source.dto";
import { JobSourcesService } from "./job-sources.service";

const jobSourcesValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard)
@Controller("job-sources")
export class JobSourcesController {
  constructor(
    @Inject(JobSourcesService)
    private readonly jobSourcesService: JobSourcesService,
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
  ) {}

  @Post()
  create(
    @Body(
      new ValidationPipe({
        ...jobSourcesValidationOptions,
        expectedType: CreateJobSourceDto,
      }),
    )
    dto: CreateJobSourceDto,
  ) {
    return this.jobSourcesService.create(dto);
  }

  @Get()
  list() {
    return this.jobSourcesService.list();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.jobSourcesService.getById(id);
  }

  @Post(":id/run")
  @HttpCode(200)
  run(@Param("id") id: string) {
    return this.ingestionService.runJobSource(id);
  }

  @Get(":id/runs")
  listRuns(@Param("id") id: string) {
    return this.ingestionService.listRuns(id);
  }

  @Get(":id/runs/:runId")
  getRun(@Param("id") id: string, @Param("runId") runId: string) {
    return this.ingestionService.getRun(id, runId);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...jobSourcesValidationOptions,
        expectedType: UpdateJobSourceDto,
      }),
    )
    dto: UpdateJobSourceDto,
  ) {
    return this.jobSourcesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(200)
  remove(@Param("id") id: string) {
    return this.jobSourcesService.remove(id);
  }
}
