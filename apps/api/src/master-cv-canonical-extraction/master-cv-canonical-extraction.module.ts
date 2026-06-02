import { Module } from "@nestjs/common";
import OpenAI from "openai";

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
      provide: "OPENAI_CLIENT",
      useFactory: () =>
        new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        }),
    },
  ],
  exports: [MasterCvCanonicalExtractionService],
})
export class MasterCvCanonicalExtractionModule {}
