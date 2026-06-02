import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { MasterCvCanonicalExtractionModule } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { ResumesController } from "./resumes.controller";
import { ResumesService } from "./resumes.service";

@Module({
  imports: [
    DatabaseModule,
    ProfilesModule,
    ...(process.env.MASTER_CV_CANONICAL_EXTRACTION_ENABLED === "true"
      ? [MasterCvCanonicalExtractionModule]
      : []),
  ],
  controllers: [ResumesController],
  providers: [ResumesService],
})
export class ResumesModule {}
