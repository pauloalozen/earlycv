import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { GoogleIndexingModule } from "../google-indexing/google-indexing.module";
import { WebRevalidationModule } from "../web-revalidation/web-revalidation.module";
import { JobLifecycleService } from "./job-lifecycle.service";

@Module({
  exports: [JobLifecycleService],
  imports: [DatabaseModule, GoogleIndexingModule, WebRevalidationModule],
  providers: [JobLifecycleService],
})
export class JobLifecycleModule {}
