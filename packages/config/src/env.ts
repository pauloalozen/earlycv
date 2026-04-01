export type EnvSource = Record<string, string | undefined>;

export type EnvField<TValue = string> = {
  default?: string;
  optional?: boolean;
  parse?: (value: string, key: string) => TValue;
};

export type EnvSchema = Record<string, EnvField<unknown>>;

type InferEnv<TSchema extends EnvSchema> = {
  [TKey in keyof TSchema]: TSchema[TKey] extends EnvField<infer TValue>
    ? TValue
    : never;
};

export class EnvError extends Error {
  constructor(key: string, message: string) {
    super(`${key}: ${message}`);
    this.name = "EnvError";
  }
}

function defaultEnvSource(): EnvSource {
  const scope = globalThis as {
    process?: {
      env?: EnvSource;
    };
  };

  return scope.process?.env ?? {};
}

export function parseEnv<TSchema extends EnvSchema>(
  schema: TSchema,
  source: EnvSource = defaultEnvSource(),
): InferEnv<TSchema> {
  const output = {} as InferEnv<TSchema>;

  for (const [key, field] of Object.entries(schema)) {
    const rawValue = source[key] ?? field.default;

    if (rawValue == null || rawValue === "") {
      if (field.optional) {
        continue;
      }

      throw new EnvError(key, "is required");
    }

    try {
      output[key as keyof TSchema] = (
        field.parse ? field.parse(rawValue, key) : rawValue
      ) as InferEnv<TSchema>[keyof TSchema];
    } catch (error) {
      if (error instanceof EnvError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : "failed to parse value";

      throw new EnvError(key, message);
    }
  }

  return output;
}

export function defineEnv<TSchema extends EnvSchema>(schema: TSchema) {
  return (source?: EnvSource) => parseEnv(schema, source);
}

export function envToNumber(value: string, key = "value") {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new EnvError(key, "must be a valid number");
  }

  return parsed;
}

export function envToBoolean(value: string) {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
