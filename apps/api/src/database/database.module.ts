import { Module } from "@nestjs/common";

import { DatabaseService, EARLYCV_DATABASE_CLIENT } from "./database.service";

@Module({
  providers: [
    {
      provide: EARLYCV_DATABASE_CLIENT,
      useFactory: async () => {
        const { createDatabaseClient } = await import("@earlycv/database");

        return createDatabaseClient();
      },
    },
    {
      provide: DatabaseService,
      inject: [EARLYCV_DATABASE_CLIENT],
      useFactory: (prisma: unknown) => new DatabaseService(prisma as never),
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
