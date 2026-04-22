export const ANALYSIS_CONFIG_ENV_PREFIX = "ANALYSIS_";

type AnalysisConfigRiskLevel = "low" | "medium" | "high";

type AnalysisBooleanConfig = {
  type: "boolean";
  default: boolean;
  risk: AnalysisConfigRiskLevel;
};

type AnalysisIntConfig = {
  type: "int";
  default: number;
  min: number;
  max: number;
  risk: AnalysisConfigRiskLevel;
};

type AnalysisDurationMsConfig = {
  type: "duration_ms";
  default: number;
  min: number;
  max: number;
  risk: AnalysisConfigRiskLevel;
};

type AnalysisPercentConfig = {
  type: "percent";
  default: number;
  min: number;
  max: number;
  risk: AnalysisConfigRiskLevel;
};

type AnalysisListConfig = {
  type: "list";
  default: string[];
  itemType: "string";
  separator?: string;
  minItems?: number;
  maxItems?: number;
  risk: AnalysisConfigRiskLevel;
};

type AnalysisEnumConfig = {
  type: "enum";
  default: string;
  values: readonly string[];
  risk: AnalysisConfigRiskLevel;
};

type AnalysisUnitConfig = {
  type: "unit";
  default: string;
  baseUnit: "ms";
  allowedUnits: readonly ["ms", "s", "m", "h"];
  min: number;
  max: number;
  risk: AnalysisConfigRiskLevel;
};

export type AnalysisConfigDefinition =
  | AnalysisBooleanConfig
  | AnalysisIntConfig
  | AnalysisDurationMsConfig
  | AnalysisPercentConfig
  | AnalysisListConfig
  | AnalysisEnumConfig
  | AnalysisUnitConfig;

export const ANALYSIS_CONFIG_SCHEMA = {
  auth_emergency_enabled: {
    default: false,
    risk: "high",
    type: "boolean",
  },
  kill_switch_enabled: {
    default: false,
    risk: "high",
    type: "boolean",
  },
  dedupe_enforced: {
    default: true,
    risk: "high",
    type: "boolean",
  },
  daily_limit_enforced: {
    default: true,
    risk: "high",
    type: "boolean",
  },
  turnstile_enforced: {
    default: true,
    risk: "high",
    type: "boolean",
  },
  rate_limit_raw_enforced: {
    default: true,
    risk: "high",
    type: "boolean",
  },
  rate_limit_contextual_enforced: {
    default: true,
    risk: "high",
    type: "boolean",
  },
  rate_limit_raw_per_minute: {
    default: 60,
    max: 1000,
    min: 1,
    risk: "medium",
    type: "int",
  },
  rate_limit_contextual_per_minute: {
    default: 30,
    max: 1000,
    min: 1,
    risk: "medium",
    type: "int",
  },
  turnstile_max_token_age_ms: {
    default: 120_000,
    max: 300_000,
    min: 5_000,
    risk: "high",
    type: "duration_ms",
  },
  abuse_signal_threshold_percent: {
    default: 85,
    max: 100,
    min: 0,
    risk: "medium",
    type: "percent",
  },
  protected_routes_allowlist: {
    default: ["/api/cv-adaptation/analyze", "/api/cv-adaptation/analyze-guest"],
    itemType: "string",
    maxItems: 20,
    minItems: 0,
    risk: "medium",
    separator: ",",
    type: "list",
  },
  rollout_mode: {
    default: "observe-only",
    risk: "high",
    type: "enum",
    values: ["observe-only", "soft-block", "hard-block"],
  },
  dedupe_lock_ttl: {
    allowedUnits: ["ms", "s", "m", "h"],
    baseUnit: "ms",
    default: "10s",
    max: 60_000,
    min: 1_000,
    risk: "medium",
    type: "unit",
  },
} as const satisfies Record<string, AnalysisConfigDefinition>;

export type AnalysisConfigSchema = typeof ANALYSIS_CONFIG_SCHEMA;
export type AnalysisConfigKey = keyof AnalysisConfigSchema;
