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

// Se o processo que roda o IngestionManualRunnerService morrer no meio
// (deploy, restart, crash), o batch/job run fica preso indefinidamente
// em queued/running/cancelling — nada mais vai atualiza-lo (o lock que
// controlava o processamento tambem morreu com o processo). Sem
// nenhuma atividade por mais que esse limiar, tratamos como abandonado.
const STALE_BATCH_THRESHOLD_MS = 15 * 60_000;

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
        onlyMissingLogo: dto.onlyMissingLogo ?? false,
        scopeType: dto.scopeType,
        ...scheduleFields,
      },
    });
  }

  // isAdHoc=false: a listagem so mostra jobs criados explicitamente pelo
  // popup "Criar job" — o job MANUAL/SOURCE auto-criado por "Carregar
  // vagas" direto na fonte (runSourceAdHoc) fica de fora, mesmo existindo
  // de verdade no banco (precisa existir pra dar jobId as execucoes
  // aparecerem no historico).
  findAll() {
    return this.database.ingestionJob.findMany({
      include: jobWithSourceInclude,
      orderBy: [{ createdAt: "desc" }],
      where: { isAdHoc: false },
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

  // Disparo "Carregar vagas" direto na fonte (aba Fontes / detalhe da
  // fonte) — fire-and-forget: cria/reaproveita um IngestionJob MANUAL
  // exclusivo dessa fonte, marcado isAdHoc (nunca aparece na listagem de
  // jobs, so existe pra dar jobId a execucao) e despacha via o mesmo
  // dispatchService — que so cria o IngestionBatchRun e retorna, o crawl
  // de fato roda async pelo IngestionManualRunnerService. Resultado
  // aparece no historico de execucoes da aba Jobs, com o nome da fonte e
  // disparo=MANUAL, sem poluir a listagem de jobs configurados.
  async runSourceAdHoc(jobSourceId: string) {
    const source = await this.database.jobSource.findUnique({
      include: { company: { select: { name: true } } },
      where: { id: jobSourceId },
    });

    if (!source) {
      throw new NotFoundException(`job source ${jobSourceId} not found`);
    }

    let job = await this.database.ingestionJob.findFirst({
      where: {
        jobSourceId,
        scheduleType: "MANUAL",
        scopeType: "SOURCE",
      },
    });

    if (!job) {
      job = await this.database.ingestionJob.create({
        data: {
          isAdHoc: true,
          jobSourceId,
          jobType: "CRAWL",
          name: `${source.company.name} · ${source.sourceName}`,
          scheduleDaysOfWeek: [],
          scheduleMinute: 0,
          scheduleType: "MANUAL",
          scopeType: "SOURCE",
        },
      });
    }

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
      triggeredBy: query.triggeredBy,
    };

    const [runs, total] = await Promise.all([
      this.database.ingestionJobRun.findMany({
        include: {
          batchRun: {
            select: {
              cancelRequestedAt: true,
              failedCount: true,
              finishedAt: true,
              scopeType: true,
              scopeValue: true,
              skippedCount: true,
              status: true,
              succeededCount: true,
              totalSources: true,
              updatedAt: true,
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
      batchRunId: string | null;
      status: IngestionJobRunStatus;
      batchRun: {
        cancelRequestedAt: Date | null;
        finishedAt: Date | null;
        status: IngestionBatchRunStatus;
        updatedAt: Date;
      } | null;
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
    if (mappedStatus) {
      const updated = await this.database.ingestionJobRun.update({
        // batchRun.finishedAt e o momento real em que o crawl terminou —
        // usar new Date() aqui carimbaria o horario em que essa leitura
        // aconteceu (que pode ser horas depois, ja que a reconciliacao so
        // roda quando alguem abre a lista), nao o horario real de termino.
        data: {
          finishedAt: run.batchRun.finishedAt ?? new Date(),
          status: mappedStatus,
        },
        where: { id: run.id },
      });

      return { ...run, ...updated };
    }

    // batchRun ainda em queued/running/cancelling mas sem nenhuma
    // atividade ha muito tempo — provavelmente o processo que o
    // processava morreu (deploy, restart, crash) antes de finalizar.
    const isStale =
      Date.now() - run.batchRun.updatedAt.getTime() > STALE_BATCH_THRESHOLD_MS;
    if (!isStale) {
      return run;
    }

    const finalStatus: IngestionJobRunStatus = run.batchRun.cancelRequestedAt
      ? "CANCELLED"
      : "FAILED";
    const finalBatchStatus: IngestionBatchRunStatus =
      finalStatus === "CANCELLED" ? "cancelled" : "failed";

    if (run.batchRunId) {
      await this.database.ingestionBatchRun.update({
        data: { finishedAt: new Date(), status: finalBatchStatus },
        where: { id: run.batchRunId },
      });
    }

    const updated = await this.database.ingestionJobRun.update({
      data: {
        errorMessage:
          "Processamento interrompido (ex: reinicio do servidor) e marcado como abandonado apos ficar sem atividade.",
        finishedAt: new Date(),
        status: finalStatus,
      },
      where: { id: run.id },
    });

    return { ...run, ...updated };
  }
}
