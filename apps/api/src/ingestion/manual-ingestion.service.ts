import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ListManualRunItemsDto } from "./dto/list-manual-run-items.dto";
import type { ListManualRunsDto } from "./dto/list-manual-runs.dto";
import type { ManualAdapterType } from "./dto/start-manual-adapter-run.dto";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";

@Injectable()
export class ManualIngestionService {
  constructor(
    @Inject(ManualIngestionBatchRepository)
    private readonly batchRepository: ManualIngestionBatchRepository,
  ) {}

  async startAdapterRun(
    adapterType: ManualAdapterType,
    requestedByUserId: string,
  ) {
    const run = await this.batchRepository.createAdapterBatchRun({
      adapterType,
      requestedByUserId,
    });

    return {
      batchRunId: run.id,
      status: run.status,
    };
  }

  listRuns(filters: ListManualRunsDto = {}) {
    return this.batchRepository.listRuns(filters);
  }

  async getRunById(batchRunId: string) {
    const run = await this.batchRepository.getRunById(batchRunId);
    if (!run) {
      throw new NotFoundException("manual ingestion batch run not found");
    }

    return run;
  }

  async listRunItems(batchRunId: string, filters: ListManualRunItemsDto = {}) {
    await this.getRunById(batchRunId);
    return this.batchRepository.listRunItems(batchRunId, filters);
  }

  async cancel(batchRunId: string) {
    const run = await this.batchRepository.markCancelRequested(batchRunId);
    if (!run) {
      throw new NotFoundException("manual ingestion batch run not found");
    }

    return run;
  }
}
