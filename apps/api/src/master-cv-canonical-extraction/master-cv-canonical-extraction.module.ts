import { Module } from "@nestjs/common";
import { createAiClientFromEnv } from "../common/ai-client-factory";

import { DatabaseModule } from "../database/database.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { MasterCvCanonicalExtractionService } from "./master-cv-canonical-extraction.service";
import { MasterCvCanonicalExtractionWorker } from "./master-cv-canonical-extraction.worker";

@Module({
  imports: [DatabaseModule, ProfilesModule],
  providers: [
    MasterCvCanonicalExtractionService,
    MasterCvCanonicalExtractionWorker,
    {
      provide: "MASTERCV_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("MASTERCV"),
    },
  ],
  exports: [MasterCvCanonicalExtractionService],
})
export class MasterCvCanonicalExtractionModule {}
