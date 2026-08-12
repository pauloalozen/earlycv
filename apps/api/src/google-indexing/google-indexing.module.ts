import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { GoogleIndexingService } from "./google-indexing.service";

@Module({
  imports: [DatabaseModule],
  providers: [GoogleIndexingService],
  exports: [GoogleIndexingService],
})
export class GoogleIndexingModule {}
