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
