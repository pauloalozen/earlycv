import { Inject, Injectable, Optional } from "@nestjs/common";
import type { SemanticFilterConfig } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export type SemanticFilterDecision = {
  configVersion: string;
  reason: string;
  result: "ENRICH" | "SKIP";
};

type SemanticFilterServiceOptions = {
  cacheTtlMs?: number;
  now?: () => number;
};

export const SEMANTIC_FILTER_SERVICE_OPTIONS =
  "SEMANTIC_FILTER_SERVICE_OPTIONS";

function stripAccents(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function stripGeographicSuffix(value: string) {
  const dashIndex = value.indexOf(" - ");
  if (dashIndex === -1) return value;
  return value.slice(0, dashIndex);
}

function normalizeTitleForFilter(value: string) {
  const withoutParens = value.replace(/\([^)]*\)/g, " ");
  const normalized = stripAccents(withoutParens).toLowerCase().trim();
  return stripGeographicSuffix(normalized).replace(/\s+/g, " ").trim();
}

@Injectable()
export class SemanticFilterService {
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cache: { config: SemanticFilterConfig; expiresAt: number } | null =
    null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional()
    @Inject(SEMANTIC_FILTER_SERVICE_OPTIONS)
    options: SemanticFilterServiceOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  async getActiveConfig(): Promise<SemanticFilterConfig> {
    const cached = this.cache;
    if (cached && cached.expiresAt > this.now()) {
      return cached.config;
    }

    const config = await this.database.semanticFilterConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!config) {
      throw new Error("No active SemanticFilterConfig found");
    }

    this.cache = { config, expiresAt: this.now() + this.cacheTtlMs };
    return config;
  }

  invalidateCache() {
    this.cache = null;
  }

  async evaluate(normalizedTitle: string): Promise<SemanticFilterDecision> {
    const config = await this.getActiveConfig();
    const title = normalizeTitleForFilter(normalizedTitle);

    const noiseSignal = config.noiseSignals.find((signal) =>
      title.includes(signal.toLowerCase()),
    );
    if (noiseSignal) {
      return {
        configVersion: config.version,
        reason: `noise_signal:${noiseSignal}`,
        result: "SKIP",
      };
    }

    const techSignal = config.techSignals.find((signal) =>
      title.includes(signal.toLowerCase()),
    );
    if (techSignal) {
      return {
        configVersion: config.version,
        reason: `tech_signal:${techSignal}`,
        result: "ENRICH",
      };
    }

    return {
      configVersion: config.version,
      reason: "zona_cinza",
      result: "SKIP",
    };
  }
}
