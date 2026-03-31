import { Injectable } from "@nestjs/common";

@Injectable()
export class InfraService {
  async getDiagnostics() {
    const [
      { aiProviders, defaultAIProvider },
      { databaseScaffold },
      { plannedQueues },
      storage,
    ] = await Promise.all([
      import("@earlycv/ai"),
      import("@earlycv/database"),
      import("@earlycv/queue"),
      import("@earlycv/storage"),
    ]);

    const localStorageDriver = storage.defineStorageDriver({
      driver: "memory",
      async deleteObject() {},
      async getObject() {
        return null;
      },
      async putObject(input) {
        return {
          contentType: input.contentType,
          key: input.key,
          size: input.body.byteLength,
        };
      },
    });

    return {
      ai: {
        defaultProvider: defaultAIProvider,
        supportedProviders: aiProviders,
      },
      database: {
        stage: databaseScaffold.stage,
      },
      queue: {
        count: plannedQueues.length,
        names: plannedQueues.map(({ name }) => name),
      },
      storage: {
        driver: localStorageDriver.driver,
      },
    } as const;
  }
}
