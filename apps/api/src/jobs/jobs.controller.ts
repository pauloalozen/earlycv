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
import { CreateJobDto } from "./dto/create-job.dto";
import { UpdateJobDto } from "./dto/update-job.dto";
import { JobsService } from "./jobs.service";

const jobsValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard)
@Controller("jobs")
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobsService: JobsService) {}

  @Post()
  create(
    @Body(
      new ValidationPipe({
        ...jobsValidationOptions,
        expectedType: CreateJobDto,
      }),
    )
    dto: CreateJobDto,
  ) {
    return this.jobsService.create(dto);
  }

  @Get()
  list() {
    return this.jobsService.list();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.jobsService.getById(id);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...jobsValidationOptions,
        expectedType: UpdateJobDto,
      }),
    )
    dto: UpdateJobDto,
  ) {
    return this.jobsService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(200)
  remove(@Param("id") id: string) {
    return this.jobsService.remove(id);
  }
}
