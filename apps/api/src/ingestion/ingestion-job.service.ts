import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  IngestionBatchRunStatus,
  IngestionJobRunStatus,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { CreateIngestionJobDto } from "./dto/create-ingestion-job.dto";
import type { ListIngestionJobRunsDto } from "./dto/list-ingestion-job-runs.dto";
import type { UpdateIngestionJobDto } from "./dto/update-ingestion-job.dto";
import { IngestionJobDispatchService } from "./ingestion-job-dispatch.service";
import { calculateNextRunAt } from "./ingestion-job-schedule.util";

const jobWithSourceInclude = {
  jobSource: {
    select: {
      company: { select: { name: true } },
      id: true,
      sourceName: true,
    },
  },
} as const;

// IngestionJobRun de CRAWL fica QUEUED/RUNNING no dispatch e nunca e
// atualizado depois — quem processa o IngestionBatchRun de fato e o
// IngestionManualRunnerService (fora de escopo alterar), entao o status
// real de conclusao so existe no batchRun. Reconciliamos aqui, na
// leitura, em vez de um poller separado.
const TERMINAL_BATCH_STATUS: Partial<
  Record<IngestionBatchRunStatus, IngestionJobRunStatus>
> = {
  cancelled: "CANCELLED",
  completed: "COMPLETED",
  failed: "FAILED",
};

@Injectable()
export class IngestionJobService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionJobDispatchService)
    private readonly dispatchService: IngestionJobDispatchService,
  ) {}

  async create(dto: CreateIngestionJobDto) {
    if (dto.scopeType === "SOURCE" && dto.jobSourceId) {
      const source = await this.database.jobSource.findUnique({
        where: { id: dto.jobSourceId },
      });
      if (!source) {
        throw new BadRequestException(
          `job source ${dto.jobSourceId} not found`,
        );
      }
    }

    const scheduleFields = {
      scheduleDaysOfWeek: dto.scheduleDaysOfWeek ?? [],
      scheduleHour: dto.scheduleHour ?? null,
      scheduleInterval: dto.scheduleInterval ?? null,
      scheduleMinute: dto.scheduleMinute ?? 0,
      scheduleType: dto.scheduleType,
    };

    const nextRunAt = calculateNextRunAt(scheduleFields, new Date());

    return this.database.ingestionJob.create({
      data: {
        adapterType: dto.adapterType,
        description: dto.description,
        jobSourceId: dto.jobSourceId,
        jobType: dto.jobType,
        name: dto.name,
        nextRunAt,
        scopeType: dto.scopeType,
        ...scheduleFields,
      },
    });
  }

  findAll() {
    return this.database.ingestionJob.findMany({
      include: jobWithSourceInclude,
      orderBy: [{ createdAt: "desc" }],
    });
  }

  async findById(id: string) {
    const job = await this.database.ingestionJob.findUnique({
      include: jobWithSourceInclude,
      where: { id },
    });

    if (!job) {
      throw new NotFoundException(`ingestion job ${id} not found`);
    }

    return job;
  }

  async update(id: string, dto: UpdateIngestionJobDto) {
    const existing = await this.findById(id);

    const scheduleType = dto.scheduleType ?? existing.scheduleType;
    const scheduleFields = {
      scheduleDaysOfWeek: dto.scheduleDaysOfWeek ?? existing.scheduleDaysOfWeek,
      scheduleHour: dto.scheduleHour ?? existing.scheduleHour,
      scheduleInterval: dto.scheduleInterval ?? existing.scheduleInterval,
      scheduleMinute: dto.scheduleMinute ?? existing.scheduleMinute,
      scheduleType,
    };

    const nextRunAt = existing.isEnabled
      ? calculateNextRunAt(scheduleFields, new Date())
      : null;

    return this.database.ingestionJob.update({
      data: {
        description: dto.description,
        name: dto.name,
        nextRunAt,
        ...scheduleFields,
      },
      where: { id },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.database.ingestionJob.delete({ where: { id } });
  }

  async toggle(id: string) {
    const existing = await this.findById(id);
    const isEnabled = !existing.isEnabled;

    const nextRunAt = isEnabled
      ? calculateNextRunAt(existing, new Date())
      : null;

    return this.database.ingestionJob.update({
      data: { isEnabled, nextRunAt },
      where: { id },
    });
  }

  async runNow(id: string) {
    const job = await this.findById(id);
    return this.dispatchService.dispatchJob(job, "MANUAL");
  }

  async getRuns(id: string, query: ListIngestionJobRunsDto = {}) {
    await this.findById(id);
    return this.listRuns({ ...query, jobId: id });
  }

  async listRuns(query: ListIngestionJobRunsDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = {
      createdAt: {
        gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
        lte: query.dateTo ? new Date(query.dateTo) : undefined,
      },
      jobId: query.jobId,
      status: query.status,
    };

    const [runs, total] = await Promise.all([
      this.database.ingestionJobRun.findMany({
        include: {
          batchRun: {
            select: {
              failedCount: true,
              scopeType: true,
              scopeValue: true,
              skippedCount: true,
              status: true,
              succeededCount: true,
              totalSources: true,
            },
          },
          job: { select: { id: true, jobType: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize,
        where,
      }),
      this.database.ingestionJobRun.count({ where }),
    ]);

    const reconciledRuns = await Promise.all(
      runs.map((run) => this.reconcileRunStatus(run)),
    );

    return { page, pageSize, runs: reconciledRuns, total };
  }

  private async reconcileRunStatus<
    T extends {
      id: string;
      status: IngestionJobRunStatus;
      batchRun: { status: IngestionBatchRunStatus } | null;
    },
  >(run: T): Promise<T> {
    if (
      !run.batchRun ||
      run.status === "COMPLETED" ||
      run.status === "FAILED" ||
      run.status === "CANCELLED"
    ) {
      return run;
    }

    const mappedStatus = TERMINAL_BATCH_STATUS[run.batchRun.status];
    if (!mappedStatus) {
      return run;
    }

    const updated = await this.database.ingestionJobRun.update({
      data: { finishedAt: new Date(), status: mappedStatus },
      where: { id: run.id },
    });

    return { ...run, ...updated };
  }
}
