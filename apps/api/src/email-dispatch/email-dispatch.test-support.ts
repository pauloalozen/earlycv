// Suporte de teste — banco em memória mínimo para as specs de
// email-dispatch (mesmo estilo de fakes das specs de product-updates).
// NÃO é código de produção.
import { Prisma } from "@prisma/client";

import type { AppEnv } from "../config/env.module";
import { EmailDispatchConfigService } from "./email-dispatch.config";

// biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
export type Row = Record<string, any>;

// Mesmo erro que o Prisma real lança — o código de produção distingue
// duplicado por `instanceof Prisma.PrismaClientKnownRequestError`.
function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (
      condition &&
      typeof condition === "object" &&
      !(condition instanceof Date)
    ) {
      if ("lte" in condition) return row[key] <= condition.lte;
      if ("lt" in condition) return row[key] < condition.lt;
      if ("in" in condition) return condition.in.includes(row[key]);
    }
    return row[key] === condition;
  });
}

export function createTable(options: { uniqueKeys?: string[] } = {}) {
  const rows: Row[] = [];
  let seq = 0;
  const unique = options.uniqueKeys ?? [];

  const violatesUnique = (candidate: Row) =>
    rows.some((row) => unique.some((key) => row[key] === candidate[key]));

  const table = {
    rows,
    async create({ data }: { data: Row }) {
      if (violatesUnique(data)) {
        throw uniqueViolation();
      }
      const row = {
        id: `row_${++seq}`,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      rows.push(row);
      return row;
    },
    async createMany({
      data,
      skipDuplicates,
    }: {
      data: Row[];
      skipDuplicates?: boolean;
    }) {
      let count = 0;
      for (const item of data) {
        if (violatesUnique(item)) {
          if (skipDuplicates) continue;
          throw uniqueViolation();
        }
        await table.create({ data: { status: "PENDING", ...item } });
        count += 1;
      }
      return { count };
    },
    async findMany({
      where,
      take,
      orderBy,
    }: {
      where?: Row;
      take?: number;
      orderBy?: Array<Record<string, "asc" | "desc">>;
    } = {}) {
      let result = rows.filter((row) => matches(row, where));
      const order = orderBy?.[0];
      if (order) {
        const [key, dir] = Object.entries(order)[0] as [string, "asc" | "desc"];
        result = [...result].sort((a, b) =>
          dir === "asc" ? a[key] - b[key] : b[key] - a[key],
        );
      }
      return (take ? result.slice(0, take) : result).map((row) => ({ ...row }));
    },
    async findFirst({ where }: { where?: Row } = {}) {
      const row = rows.find((candidate) => matches(candidate, where));
      return row ? { ...row } : null;
    },
    async findUnique({ where }: { where: Row }) {
      const row = rows.find((candidate) => matches(candidate, where));
      return row ? { ...row } : null;
    },
    async updateMany({ where, data }: { where?: Row; data: Row }) {
      const targets = rows.filter((row) => matches(row, where));
      for (const row of targets) {
        Object.assign(row, data, { updatedAt: new Date() });
      }
      return { count: targets.length };
    },
    async update({ where, data }: { where: Row; data: Row }) {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) throw new Error("Record not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    async upsert({
      where,
      create,
      update,
    }: {
      where: Row;
      create: Row;
      update: Row;
    }) {
      const row = rows.find((candidate) => matches(candidate, where));
      if (row) {
        Object.assign(row, update, { updatedAt: new Date() });
        return { ...row };
      }
      return table.create({ data: create });
    },
  };

  return table;
}

export function buildEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    API_HOST: "0.0.0.0",
    API_PORT: 4000,
    JOBS_GHOST_MODE: false,
    JWT_ACCESS_SECRET: "secret",
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_SECRET: "secret",
    JWT_REFRESH_TTL: 2592000,
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_CALLBACK_URL: "https://example.com",
    SES_EMAIL_ENABLED: true,
    AWS_SES_SNS_LOG_SUBSCRIPTION_URL: false,
    PRODUCT_UPDATES_ENABLED: false,
    PRODUCT_UPDATE_SEND_RATE_PER_SECOND: 5,
    // Infra de envio de relacionamento COMPLETA por padrão nos testes;
    // cada teste de "não pronto" remove/estraga um item.
    AWS_SES_REGION: "us-east-1",
    AWS_SES_ACCESS_KEY_ID: "key",
    AWS_SES_SECRET_ACCESS_KEY: "secret",
    AWS_SES_CONFIGURATION_SET: "earlycv-bulk-email",
    AWS_SES_CONTACT_LIST_NAME: "earlycv-contacts",
    AWS_SES_PRODUCT_UPDATE_TOPIC_NAME: "product-updates",
    AWS_SES_RELATIONSHIP_FROM_EMAIL: "contato@earlycv.com.br",
    AWS_SES_RELATIONSHIP_FROM_NAME: "Paulo do EarlyCV",
    AWS_SES_RELATIONSHIP_REPLY_TO: "contato@earlycv.com.br",
    AWS_SES_RELATIONSHIP_CONFIGURATION_SET: "earlycv-relationship-email",
    AWS_SES_RELATIONSHIP_TOPIC_NAME: "relationship",
    EMAIL_RELATIONSHIP_START_AT: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

// EmailConfigService falso com a mesma regra do real para RELATIONSHIP —
// o real é testado em email-config.service.spec.ts.
// Classe nomeada (não anônima) — TS não aceita retornar de uma função
// exportada uma subclasse anônima de classe com membros privados.
export class TestEmailDispatchConfig extends EmailDispatchConfigService {
  constructor(
    env: ConstructorParameters<typeof EmailDispatchConfigService>[0],
    emailConfig: ConstructorParameters<typeof EmailDispatchConfigService>[1],
    private readonly production: boolean,
  ) {
    super(env, emailConfig);
  }

  protected override isProduction() {
    return this.production;
  }
}

export function createConfig(
  overrides: Partial<AppEnv> = {},
  options: { production?: boolean } = {},
) {
  const env = buildEnv(overrides);
  const emailConfig = {
    isSesEnabled: () => env.SES_EMAIL_ENABLED,
    getSesClientConfig: () => {
      if (!env.AWS_SES_REGION || !env.AWS_SES_ACCESS_KEY_ID) {
        throw new Error("ses credentials missing");
      }
      return {
        region: env.AWS_SES_REGION,
        accessKeyId: env.AWS_SES_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY ?? "",
      };
    },
    getSesSenderProfile: () => {
      if (
        !env.AWS_SES_RELATIONSHIP_FROM_EMAIL ||
        !env.AWS_SES_RELATIONSHIP_CONFIGURATION_SET
      ) {
        throw new Error("sender profile incomplete");
      }
      return {
        fromEmail: env.AWS_SES_RELATIONSHIP_FROM_EMAIL,
        fromName: env.AWS_SES_RELATIONSHIP_FROM_NAME ?? "",
        replyTo: env.AWS_SES_RELATIONSHIP_REPLY_TO,
        configurationSet: env.AWS_SES_RELATIONSHIP_CONFIGURATION_SET,
      };
    },
  };

  return new TestEmailDispatchConfig(
    env,
    emailConfig,
    options.production === true,
  );
}
