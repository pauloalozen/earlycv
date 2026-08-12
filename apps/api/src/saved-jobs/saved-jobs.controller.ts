import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { SaveJobDto } from "./dto/save-job.dto";
import { SavedJobsService } from "./saved-jobs.service";

@Controller("saved-jobs")
@UseGuards(JwtAuthGuard)
export class SavedJobsController {
  constructor(
    @Inject(SavedJobsService) private readonly service: SavedJobsService,
  ) {}

  @Get()
  list(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("sort") sort?: string,
  ) {
    const parsedPage = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
    const parsedLimit = Math.min(
      100,
      Math.max(1, Number.parseInt(limit ?? "20", 10) || 20),
    );
    const parsedSort = sort === "date_asc" ? "date_asc" : "date_desc";
    return this.service.list(user.id, parsedPage, parsedLimit, parsedSort);
  }

  @Post()
  save(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: SaveJobDto,
      }),
    )
    dto: SaveJobDto,
  ) {
    return this.service.save(user.id, dto.jobId);
  }

  @Delete(":jobId")
  async unsave(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("jobId") jobId: string,
  ) {
    await this.service.unsave(user.id, jobId);
    return { ok: true };
  }
}
