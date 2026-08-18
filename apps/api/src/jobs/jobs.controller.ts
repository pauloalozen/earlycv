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
import { BulkSetStatusBySourceDto } from "./dto/bulk-set-status-by-source.dto";
import { CreateJobDto } from "./dto/create-job.dto";
import { ListJobsAdminDto } from "./dto/list-jobs-admin.dto";
import { ReclassifyJobDto } from "./dto/reclassify-job.dto";
import { UpdateJobDto } from "./dto/update-job.dto";
import { JobsService } from "./jobs.service";

const jobsValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
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
  list(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: ListJobsAdminDto,
      }),
    )
    query: ListJobsAdminDto,
  ) {
    if (
      query.page !== undefined ||
      query.search ||
      query.sourceFilter ||
      query.statusFilter ||
      query.dominantAreaFilter ||
      query.radarVisibilityFilter
    ) {
      return this.jobsService.listAdmin(query);
    }
    return this.jobsService.list();
  }

  @Put("by-source/:jobSourceId")
  bulkSetStatusByJobSource(
    @Param("jobSourceId") jobSourceId: string,
    @Body(
      new ValidationPipe({
        ...jobsValidationOptions,
        expectedType: BulkSetStatusBySourceDto,
      }),
    )
    dto: BulkSetStatusBySourceDto,
  ) {
    return this.jobsService.bulkSetStatusByJobSource(jobSourceId, dto.status);
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

  @Put(":id/reclassify")
  reclassify(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...jobsValidationOptions,
        expectedType: ReclassifyJobDto,
      }),
    )
    dto: ReclassifyJobDto,
  ) {
    return this.jobsService.reclassifyDominantArea(id, dto.dominantArea);
  }
}
