import { Inject, Injectable } from "@nestjs/common";
import type { InternalRole } from "@prisma/client";

import {
  AnalysisConfigService,
  type AnalysisConfigWriteInput,
} from "./analysis-config.service";
import {
  ANALYSIS_CONFIG_SCHEMA,
  type AnalysisConfigDefinition,
  type AnalysisConfigKey,
} from "./config/analysis-config.schema";

type ImpactByConfigKey = Record<AnalysisConfigKey, string>;

const IMPACT_BY_CONFIG_KEY: ImpactByConfigKey = {
  auth_emergency_enabled:
    "Bloqueia analises para usuarios nao autenticados em cenarios emergenciais.",
  kill_switch_enabled:
    "Interrompe toda execucao de analise protegida imediatamente.",
  dedupe_enforced:
    "Ativa bloqueio de requisicoes duplicadas com hash canonico e lock concorrente.",
  daily_limit_enforced:
    "Aplica consumo e bloqueio por limite diario de analises por escopo.",
  turnstile_enforced:
    "Exige validacao de Turnstile antes de permitir chamada ao provedor de IA.",
  rate_limit_raw_enforced:
    "Ativa corte rapido por volume bruto de requests por IP.",
  rate_limit_contextual_enforced:
    "Ativa limites contextuais por combinacao de IP, sessao e usuario.",
  rate_limit_raw_per_minute:
    "Define teto bruto por minuto para flood protection inicial.",
  rate_limit_contextual_per_minute:
    "Define teto contextual por minuto para reduzir abuso distribuido.",
  turnstile_max_token_age_ms:
    "Controla a janela maxima de idade aceita para tokens Turnstile.",
  abuse_signal_threshold_percent:
    "Define sensibilidade para sinais de abuso no modo de protecao.",
  protected_routes_allowlist:
    "Lista rotas elegiveis para pipeline protegido de analise.",
  rollout_mode:
    "Define politica ativa entre observe-only, soft-block e hard-block.",
  dedupe_lock_ttl:
    "Define validade do lock de deduplicacao para requests concorrentes.",
};

export type AnalysisConfigBackofficeEntry = {
  defaultValue: unknown;
  impactDescription: string;
  key: AnalysisConfigKey;
  max?: number;
  min?: number;
  origin: "database" | "env" | "default";
  risk: "low" | "medium" | "high";
  type: AnalysisConfigDefinition["type"];
  value: unknown;
  values?: readonly string[];
};

export type SetAnalysisConfigFromBackofficeInput = {
  actor: {
    id?: string | null;
    role: InternalRole;
  };
  key: AnalysisConfigKey;
  source: string;
  technicalContext?: Record<string, unknown> | null;
  value: unknown;
};

@Injectable()
export class AnalysisConfigBackofficeService {
  constructor(
    @Inject(AnalysisConfigService)
    private readonly analysisConfigService: AnalysisConfigService,
  ) {}

  async getBackofficeEntries(): Promise<AnalysisConfigBackofficeEntry[]> {
    const keys = Object.keys(ANALYSIS_CONFIG_SCHEMA) as AnalysisConfigKey[];
    const sortedKeys = [...keys].sort((left, right) =>
      left.localeCompare(right),
    );
    const entries: AnalysisConfigBackofficeEntry[] = [];

    for (const key of sortedKeys) {
      const definition = ANALYSIS_CONFIG_SCHEMA[key];
      const resolved = await this.analysisConfigService.getEntry(key);

      entries.push(this.toBackofficeEntry(key, definition, resolved));
    }

    return entries;
  }

  async setFromBackoffice(
    input: SetAnalysisConfigFromBackofficeInput,
  ): Promise<AnalysisConfigBackofficeEntry> {
    const definition = ANALYSIS_CONFIG_SCHEMA[input.key];
    const writeInput: AnalysisConfigWriteInput<AnalysisConfigKey> = {
      actor: {
        id: input.actor.id,
        role: input.actor.role,
      },
      context: input.technicalContext ?? null,
      key: input.key,
      source: input.source,
      value: input.value,
    };
    const resolved = await this.analysisConfigService.setConfig(writeInput);

    return this.toBackofficeEntry(input.key, definition, resolved);
  }

  private toBackofficeEntry(
    key: AnalysisConfigKey,
    definition: AnalysisConfigDefinition,
    resolved: {
      origin: "database" | "env" | "default";
      value: unknown;
    },
  ): AnalysisConfigBackofficeEntry {
    return {
      defaultValue: definition.default,
      impactDescription: IMPACT_BY_CONFIG_KEY[key],
      key,
      max: "max" in definition ? definition.max : undefined,
      min: "min" in definition ? definition.min : undefined,
      origin: resolved.origin,
      risk: definition.risk,
      type: definition.type,
      value: resolved.value,
      values: definition.type === "enum" ? definition.values : undefined,
    };
  }
}
