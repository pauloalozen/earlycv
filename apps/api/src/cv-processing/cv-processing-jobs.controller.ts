// GET /cv-processing-jobs/:id — polling do upload/substituição de Master
// sem análise (plano, seção 1.3). Só reflete o que o worker já garantiu
// (seção 11) — nunca recalcula nada aqui.
import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { DatabaseService } from "../database/database.service";
import { CvProcessingJobService } from "./cv-processing-job.service";

@Controller("cv-processing-jobs")
@UseGuards(JwtAuthGuard)
export class CvProcessingJobsController {
  constructor(
    @Inject(CvProcessingJobService)
    private readonly jobService: CvProcessingJobService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  @Get(":id")
  async getById(
    @Param("id") id: string,
    @AuthenticatedUser() user: AuthenticatedRequestUser,
  ) {
    const job = await this.jobService.getById(id);
    if (!job) {
      throw new NotFoundException("cv processing job not found");
    }

    // Nunca expor status/erro de um job de outro usuário — o dono formal
    // é o CvSource, não o job em si.
    const cvSource = await this.database.cvSource.findUnique({
      where: { id: job.cvSourceId },
      select: { userId: true },
    });
    if (!cvSource || cvSource.userId !== user.id) {
      throw new ForbiddenException("cv processing job not accessible");
    }

    return {
      id: job.id,
      status: job.status,
      masterIntent: job.masterIntent,
      attempts: job.attempts,
      lastError: job.lastError,
      cvStructuredProfileId: job.cvStructuredProfileId,
      masterDesignationId: job.masterDesignationId,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    };
  }
}
