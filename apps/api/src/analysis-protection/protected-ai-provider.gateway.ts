import { Inject, Injectable, Optional } from "@nestjs/common";
import { ANALYSIS_NOW } from "./types";

export type ProtectedProviderExecutionOptions = {
  maxExecutionMs: number;
  timeoutMs: number;
};

export class ProtectedAiProviderGatewayError extends Error {
  constructor(
    readonly code: "provider_max_execution_exceeded" | "provider_timeout",
    message: string,
  ) {
    super(message);
    this.name = "ProtectedAiProviderGatewayError";
  }
}

@Injectable()
export class ProtectedAiProviderGateway {
  constructor(
    @Optional()
    @Inject(ANALYSIS_NOW)
    private readonly now: () => number = Date.now,
  ) {}

  async execute<TResult>(
    runProvider: () => Promise<TResult>,
    options: ProtectedProviderExecutionOptions,
  ): Promise<TResult> {
    const timeoutMs = Math.max(1, options.timeoutMs);
    const maxExecutionMs = Math.max(1, options.maxExecutionMs);
    const startedAt = this.now();
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutRef = setTimeout(() => {
        reject(
          new ProtectedAiProviderGatewayError(
            "provider_timeout",
            `Provider request timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([runProvider(), timeoutPromise]);
      const elapsedMs = this.now() - startedAt;

      if (elapsedMs > maxExecutionMs) {
        throw new ProtectedAiProviderGatewayError(
          "provider_max_execution_exceeded",
          `Provider execution exceeded ${maxExecutionMs}ms`,
        );
      }

      return result;
    } finally {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    }
  }
}
