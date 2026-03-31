import { PrismaClient } from "@prisma/client";

export type DatabaseClient = PrismaClient;
export type DatabaseClientOptions = ConstructorParameters<
  typeof PrismaClient
>[0];

export const databaseScaffold = {
  description:
    "Minimal Prisma bootstrap scaffolding for EarlyCV workspace development.",
  stage: "bootstrap",
} as const;

const globalForDatabase = globalThis as typeof globalThis & {
  __earlycvPrisma?: PrismaClient;
};

export function createDatabaseClient(options?: DatabaseClientOptions) {
  return new PrismaClient(options);
}

export function getDatabaseClient(options?: DatabaseClientOptions) {
  if (process.env.NODE_ENV === "production") {
    return createDatabaseClient(options);
  }

  if (!globalForDatabase.__earlycvPrisma) {
    globalForDatabase.__earlycvPrisma = createDatabaseClient(options);
  }

  return globalForDatabase.__earlycvPrisma;
}
