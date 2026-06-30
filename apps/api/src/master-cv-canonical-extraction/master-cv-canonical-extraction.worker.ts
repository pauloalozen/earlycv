import { Inject, Injectable, Logger } from "@nestjs/common";

import { MasterCvCanonicalExtractionService } from "./master-cv-canonical-extraction.service";

const MAX_ATTEMPTS = 3;

@Injectable()
export class MasterCvCanonicalExtractionWorker {
  private readonly logger = new Logger(MasterCvCanonicalExtractionWorker.name);

  constructor(
    @Inject(MasterCvCanonicalExtractionService)
    private readonly extractionService: Pick<
      MasterCvCanonicalExtractionService,
      "getById" | "processJob"
    >,
  ) {}

  async consume(input: { extractionId: string }) {
    const extraction = await this.extractionService.getById(input.extractionId);
    const metadata = extraction
      ? {
          extractionId: extraction.id,
          inputHash: extraction.inputHash,
          resumeId: extraction.resumeId,
          userId: extraction.userId,
        }
      : { extractionId: input.extractionId };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        this.logger.log("processing master CV canonical extraction", {
          ...metadata,
          attempt,
        });
        await this.extractionService.processJob({
          extractionId: input.extractionId,
        });
        return;
      } catch (error) {
        const transient = this.isTransientError(error);
        const shouldRetry = transient && attempt < MAX_ATTEMPTS;

        this.logger.warn("master CV canonical extraction processing failed", {
          ...metadata,
          attempt,
          error: error instanceof Error ? error.message : String(error),
          retrying: shouldRetry,
          transient,
        });

        if (!shouldRetry) {
          throw error;
        }
      }
    }
  }

  private isTransientError(error: unknown): boolean {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("rate limit") ||
      message.includes("temporar") ||
      message.includes("network") ||
      message.includes("429")
    );
  }
}
