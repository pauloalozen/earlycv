import { Inject, Injectable, Optional } from "@nestjs/common";
import type { InternalRole } from "@prisma/client";
import { DatabaseService } from "../database/database.service";
import {
  ANALYSIS_CONFIG_ENV_PREFIX,
  ANALYSIS_CONFIG_SCHEMA,
  type AnalysisConfigDefinition,
  type AnalysisConfigKey,
} from "./config/analysis-config.schema";

type ConfigOrigin = "database" | "env" | "default";
type AnalysisConfigType = AnalysisConfigDefinition["type"];
type AnalysisConfigKeysByType<T extends AnalysisConfigType> = {
  [K in AnalysisConfigKey]: (typeof ANALYSIS_CONFIG_SCHEMA)[K]["type"] extends T
    ? K
    : never;
}[AnalysisConfigKey];

type ParsedConfigValue<T extends AnalysisConfigDefinition> =
  T["type"] extends "boolean"
    ? boolean
    : T["type"] extends "int"
      ? number
      : T["type"] extends "duration_ms"
        ? number
        : T["type"] extends "percent"
          ? number
          : T["type"] extends "list"
            ? string[]
            : T["type"] extends "enum"
              ? string
              : T["type"] extends "unit"
                ? number
                : never;

type ResolvedConfigMap = {
  [K in AnalysisConfigKey]: ParsedConfigValue<
    (typeof ANALYSIS_CONFIG_SCHEMA)[K]
  >;
};

export type ResolvedConfigEntry<K extends AnalysisConfigKey> = {
  key: K;
  origin: ConfigOrigin;
  value: ResolvedConfigMap[K];
};

type DatabaseConfigRow = {
  isActive: boolean;
  key: string;
  valueJson: unknown;
  valueType: string;
};

type AnalysisConfigWriteActor = {
  id?: string | null;
  role?: InternalRole;
};

export type AnalysisConfigWriteInput<K extends AnalysisConfigKey> = {
  actor?: AnalysisConfigWriteActor;
  context?: Record<string, unknown> | null;
  key: K;
  source: string;
  value: unknown;
};

type AnalysisConfigServiceOptions = {
  cacheTtlMs?: number;
  now?: () => number;
};

export const ANALYSIS_CONFIG_SERVICE_OPTIONS =
  "ANALYSIS_CONFIG_SERVICE_OPTIONS";

type ResolvedAllConfig = {
  entries: {
    [K in AnalysisConfigKey]: ResolvedConfigEntry<K>;
  };
  values: ResolvedConfigMap;
};

@Injectable()
export class AnalysisConfigService {
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cache: { expiresAt: number; payload: ResolvedAllConfig } | null =
    null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional()
    @Inject(ANALYSIS_CONFIG_SERVICE_OPTIONS)
    options: AnalysisConfigServiceOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  async getAll() {
    const resolved = await this.resolveAll();

    return resolved.values;
  }

  async getBoolean<K extends AnalysisConfigKeysByType<"boolean">>(
    key: K,
  ): Promise<ResolvedConfigEntry<K>> {
    const resolved = await this.resolveAll();

    return resolved.entries[key] as ResolvedConfigEntry<K>;
  }

  async getInt<K extends AnalysisConfigKeysByType<"int">>(
    key: K,
  ): Promise<ResolvedConfigEntry<K>> {
    const resolved = await this.resolveAll();

    return resolved.entries[key] as ResolvedConfigEntry<K>;
  }

  async getEnum<K extends AnalysisConfigKeysByType<"enum">>(
    key: K,
  ): Promise<ResolvedConfigEntry<K>> {
    const resolved = await this.resolveAll();

    return resolved.entries[key] as ResolvedConfigEntry<K>;
  }

  async setConfig<K extends AnalysisConfigKey>(
    input: AnalysisConfigWriteInput<K>,
  ): Promise<ResolvedConfigEntry<K>> {
    const definition = ANALYSIS_CONFIG_SCHEMA[input.key];
    const actorRole = input.actor?.role ?? "none";
    const actorId = input.actor?.id ?? null;
    const source = input.source.trim();

    if (source.length === 0) {
      throw new Error("Config write source is required");
    }

    this.assertCanWriteCriticalConfig(input.key, definition.risk, actorRole);

    const valueJson = this.normalizeWriteValue(
      definition,
      input.value,
      input.key,
    );
    const valueType = this.expectedDatabaseType(definition.type);

    await this.database.$transaction(async (tx: any) => {
      const existing = await tx.analysisProtectionConfig.findUnique({
        where: { key: input.key },
      });

      await tx.analysisProtectionConfig.upsert({
        where: { key: input.key },
        update: {
          isActive: true,
          riskLevel: definition.risk,
          valueJson,
          valueType: valueType as any,
        },
        create: {
          isActive: true,
          key: input.key,
          riskLevel: definition.risk,
          valueJson,
          valueType: valueType as any,
        },
      });

      await tx.analysisProtectionConfigAudit.create({
        data: {
          actorId,
          actorRole,
          key: input.key,
          newValueJson: valueJson,
          oldValueJson: existing?.valueJson ?? null,
          riskLevel: definition.risk,
          source,
          technicalContextJson: input.context ?? null,
          valueType: valueType as any,
        },
      });
    });

    this.cache = null;

    return {
      key: input.key,
      origin: "database",
      value: this.parseTypedValue(
        definition,
        valueJson,
        `${input.key} database value`,
      ),
    } as ResolvedConfigEntry<K>;
  }

  private async resolveAll() {
    const cached = this.cache;

    if (cached && cached.expiresAt > this.now()) {
      return cached.payload;
    }

    const rows = (await this.database.analysisProtectionConfig.findMany({
      where: {
        isActive: true,
        key: {
          in: Object.keys(ANALYSIS_CONFIG_SCHEMA),
        },
      },
    })) as DatabaseConfigRow[];
    const dbMap = new Map(rows.map((row) => [row.key, row]));
    const entries: Record<string, ResolvedConfigEntry<AnalysisConfigKey>> = {};
    const values: Record<string, ResolvedConfigMap[AnalysisConfigKey]> = {};

    for (const key of Object.keys(
      ANALYSIS_CONFIG_SCHEMA,
    ) as AnalysisConfigKey[]) {
      const resolved = this.resolveSingle(key, dbMap.get(key));

      entries[key] = resolved as ResolvedConfigEntry<AnalysisConfigKey>;
      values[key] = resolved.value as ResolvedConfigMap[AnalysisConfigKey];
    }

    const finalValues = values as unknown as ResolvedConfigMap;

    this.validateCrossConfig(finalValues);

    const payload = {
      entries: entries as unknown as {
        [K in AnalysisConfigKey]: ResolvedConfigEntry<K>;
      },
      values: finalValues,
    };

    const hasEnvOverrides = Object.values(payload.entries).some(
      (entry) => entry.origin === "env",
    );

    if (!hasEnvOverrides) {
      this.cache = {
        expiresAt: this.now() + this.cacheTtlMs,
        payload,
      };
    }

    return payload;
  }

  private assertCanWriteCriticalConfig(
    key: AnalysisConfigKey,
    riskLevel: AnalysisConfigDefinition["risk"],
    actorRole: InternalRole,
  ) {
    if (
      riskLevel === "high" &&
      actorRole !== "admin" &&
      actorRole !== "superadmin"
    ) {
      throw new Error(
        `Actor role ${actorRole} is not allowed to change high-risk config ${key}`,
      );
    }
  }

  private normalizeWriteValue(
    definition: AnalysisConfigDefinition,
    rawValue: unknown,
    key: AnalysisConfigKey,
  ) {
    switch (definition.type) {
      case "unit": {
        if (typeof rawValue === "number") {
          this.assertInRange(
            rawValue,
            definition.min,
            definition.max,
            `${key} value`,
          );
          return `${rawValue}${definition.baseUnit}`;
        }

        const value = String(rawValue).trim().toLowerCase();
        const match = value.match(/^(\d+)(ms|s|m|h)$/);

        if (!match) {
          throw new Error(`Invalid unit value for ${key} value`);
        }

        if (
          !definition.allowedUnits.includes(match[2] as "ms" | "s" | "m" | "h")
        ) {
          throw new Error(`Invalid unit value for ${key} value`);
        }

        const amount = Number.parseInt(match[1], 10);
        const inMs =
          amount * this.unitMultiplier(match[2] as "ms" | "s" | "m" | "h");

        this.assertInRange(
          inMs,
          definition.min,
          definition.max,
          `${key} value`,
        );

        return value;
      }
      default:
        return this.parseTypedValue(definition, rawValue, `${key} value`);
    }
  }

  private resolveSingle<K extends AnalysisConfigKey>(
    key: K,
    row: DatabaseConfigRow | undefined,
  ): ResolvedConfigEntry<K> {
    const definition = ANALYSIS_CONFIG_SCHEMA[key];
    const envKey = this.toEnvKey(key);

    if (row) {
      this.ensureDatabaseTypeMatch(key, definition, row.valueType);

      return {
        key,
        origin: "database",
        value: this.parseTypedValue(
          definition,
          row.valueJson,
          `${key} database value`,
        ),
      } as ResolvedConfigEntry<K>;
    }

    const envValue = process.env[envKey];

    if (envValue !== undefined) {
      return {
        key,
        origin: "env",
        value: this.parseTypedValue(
          definition,
          envValue,
          `${key} env value (${envKey})`,
        ),
      } as ResolvedConfigEntry<K>;
    }

    return {
      key,
      origin: "default",
      value: this.parseTypedValue(
        definition,
        definition.default,
        `${key} default value`,
      ),
    } as ResolvedConfigEntry<K>;
  }

  private parseTypedValue<T extends AnalysisConfigDefinition>(
    definition: T,
    rawValue: unknown,
    sourceLabel: string,
  ): ParsedConfigValue<T> {
    switch (definition.type) {
      case "boolean":
        return this.parseBoolean(rawValue, sourceLabel) as ParsedConfigValue<T>;
      case "int":
        return this.parseInt(
          rawValue,
          definition.min,
          definition.max,
          sourceLabel,
        ) as ParsedConfigValue<T>;
      case "duration_ms":
        return this.parseDurationMs(
          rawValue,
          definition.min,
          definition.max,
          sourceLabel,
        ) as ParsedConfigValue<T>;
      case "percent":
        return this.parsePercent(
          rawValue,
          definition.min,
          definition.max,
          sourceLabel,
        ) as ParsedConfigValue<T>;
      case "list":
        return this.parseList(
          rawValue,
          definition,
          sourceLabel,
        ) as ParsedConfigValue<T>;
      case "enum":
        return this.parseEnum(
          rawValue,
          definition.values,
          sourceLabel,
        ) as ParsedConfigValue<T>;
      case "unit":
        return this.parseUnit(
          rawValue,
          definition,
          sourceLabel,
        ) as ParsedConfigValue<T>;
      default:
        throw new Error(`Unsupported analysis config type for ${sourceLabel}`);
    }
  }

  private parseBoolean(rawValue: unknown, sourceLabel: string) {
    if (typeof rawValue === "boolean") {
      return rawValue;
    }

    if (typeof rawValue === "number") {
      if (rawValue === 1) {
        return true;
      }

      if (rawValue === 0) {
        return false;
      }
    }

    if (typeof rawValue === "string") {
      const normalized = rawValue.trim().toLowerCase();

      if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
    }

    throw new Error(`Invalid boolean value for ${sourceLabel}`);
  }

  private parseInt(
    rawValue: unknown,
    min: number,
    max: number,
    sourceLabel: string,
  ) {
    const parsed = this.parseStrictInteger(rawValue, sourceLabel);

    this.assertInRange(parsed, min, max, sourceLabel);

    return parsed;
  }

  private parseDurationMs(
    rawValue: unknown,
    min: number,
    max: number,
    sourceLabel: string,
  ) {
    if (typeof rawValue === "number") {
      this.assertInteger(rawValue, sourceLabel);
      this.assertInRange(rawValue, min, max, sourceLabel);

      return rawValue;
    }

    if (typeof rawValue === "string") {
      const normalized = rawValue.trim().toLowerCase();
      const match = normalized.match(/^(\d+)(ms|s|m|h)?$/);

      if (!match) {
        throw new Error(`Invalid duration value for ${sourceLabel}`);
      }

      const amount = Number.parseInt(match[1], 10);
      const unit = (match[2] ?? "ms") as "ms" | "s" | "m" | "h";
      const value = amount * this.unitMultiplier(unit);

      this.assertInRange(value, min, max, sourceLabel);

      return value;
    }

    throw new Error(`Invalid duration value for ${sourceLabel}`);
  }

  private parsePercent(
    rawValue: unknown,
    min: number,
    max: number,
    sourceLabel: string,
  ) {
    if (typeof rawValue === "number") {
      this.assertInRange(rawValue, min, max, sourceLabel);

      return rawValue;
    }

    if (typeof rawValue === "string") {
      const normalized = rawValue.trim();

      if (!/^-?(?:\d+|\d+\.\d+|\.\d+)%?$/.test(normalized)) {
        throw new Error(`Invalid percent value for ${sourceLabel}`);
      }

      const withoutSymbol = normalized.endsWith("%")
        ? normalized.slice(0, -1)
        : normalized;
      const value = Number.parseFloat(withoutSymbol);

      if (Number.isNaN(value)) {
        throw new Error(`Invalid percent value for ${sourceLabel}`);
      }

      this.assertInRange(value, min, max, sourceLabel);

      return value;
    }

    throw new Error(`Invalid percent value for ${sourceLabel}`);
  }

  private parseList(
    rawValue: unknown,
    definition: Extract<AnalysisConfigDefinition, { type: "list" }>,
    sourceLabel: string,
  ) {
    const parsed = Array.isArray(rawValue)
      ? rawValue
          .map((entry) => {
            if (typeof entry !== "string") {
              throw new Error(`Invalid list item for ${sourceLabel}`);
            }

            return entry.trim();
          })
          .filter((entry) => entry.length > 0)
      : typeof rawValue === "string"
        ? rawValue
            .split(definition.separator ?? ",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : null;

    if (!parsed) {
      throw new Error(`Invalid list value for ${sourceLabel}`);
    }

    if (
      definition.minItems !== undefined &&
      parsed.length < definition.minItems
    ) {
      throw new Error(`List value for ${sourceLabel} is out of range`);
    }

    if (
      definition.maxItems !== undefined &&
      parsed.length > definition.maxItems
    ) {
      throw new Error(`List value for ${sourceLabel} is out of range`);
    }

    return parsed;
  }

  private parseEnum(
    rawValue: unknown,
    values: readonly string[],
    sourceLabel: string,
  ) {
    if (typeof rawValue !== "string") {
      throw new Error(`Invalid enum value for ${sourceLabel}`);
    }

    if (!values.includes(rawValue)) {
      throw new Error(`Invalid enum value for ${sourceLabel}`);
    }

    return rawValue;
  }

  private parseUnit(
    rawValue: unknown,
    definition: Extract<AnalysisConfigDefinition, { type: "unit" }>,
    sourceLabel: string,
  ) {
    const normalized =
      typeof rawValue === "number"
        ? `${rawValue}${definition.baseUnit}`
        : String(rawValue).trim().toLowerCase();
    const match = normalized.match(/^(\d+)(ms|s|m|h)$/);

    if (!match) {
      throw new Error(`Invalid unit value for ${sourceLabel}`);
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = match[2] as "ms" | "s" | "m" | "h";

    if (!definition.allowedUnits.includes(unit)) {
      throw new Error(`Invalid unit value for ${sourceLabel}`);
    }

    const value = amount * this.unitMultiplier(unit);

    this.assertInRange(value, definition.min, definition.max, sourceLabel);

    return value;
  }

  private parseStrictInteger(rawValue: unknown, sourceLabel: string) {
    if (typeof rawValue === "number") {
      this.assertInteger(rawValue, sourceLabel);

      return rawValue;
    }

    if (typeof rawValue === "string" && /^-?\d+$/.test(rawValue.trim())) {
      return Number.parseInt(rawValue, 10);
    }

    throw new Error(`Invalid integer value for ${sourceLabel}`);
  }

  private assertInteger(value: number, sourceLabel: string) {
    if (!Number.isInteger(value)) {
      throw new Error(`Invalid integer value for ${sourceLabel}`);
    }
  }

  private assertInRange(
    value: number,
    min: number,
    max: number,
    sourceLabel: string,
  ) {
    if (value < min || value > max) {
      throw new Error(
        `Value for ${sourceLabel} is out of range (${min}-${max})`,
      );
    }
  }

  private unitMultiplier(unit: "ms" | "s" | "m" | "h") {
    switch (unit) {
      case "ms":
        return 1;
      case "s":
        return 1_000;
      case "m":
        return 60_000;
      case "h":
        return 3_600_000;
      default:
        throw new Error(`Unsupported unit: ${unit}`);
    }
  }

  private validateCrossConfig(values: ResolvedConfigMap) {
    if (
      values.rate_limit_contextual_per_minute > values.rate_limit_raw_per_minute
    ) {
      throw new Error(
        "Cross-config validation failed: rate_limit_contextual_per_minute cannot exceed rate_limit_raw_per_minute",
      );
    }
  }

  private ensureDatabaseTypeMatch(
    key: AnalysisConfigKey,
    definition: AnalysisConfigDefinition,
    valueType: string,
  ) {
    const expected = this.expectedDatabaseType(definition.type);

    if (valueType !== expected) {
      throw new Error(
        `Database type mismatch for ${key}: expected ${expected}, received ${valueType}`,
      );
    }
  }

  private expectedDatabaseType(type: AnalysisConfigDefinition["type"]): string {
    switch (type) {
      case "boolean":
        return "boolean";
      case "int":
        return "int";
      case "duration_ms":
        return "duration_ms";
      case "percent":
        return "percent";
      case "enum":
        return "enum";
      case "list":
        return "json";
      case "unit":
        return "string";
      default:
        throw new Error(`Unsupported config type mapping: ${type}`);
    }
  }

  private toEnvKey(key: string) {
    return `${ANALYSIS_CONFIG_ENV_PREFIX}${key.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  }
}
