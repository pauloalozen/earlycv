import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { ProfileCanonicalMergeService } from "./profile-canonical-merge.service";
import { ProfileReadinessService } from "./profile-readiness.service";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfileCanonicalMergeService, ProfileReadinessService],
  exports: [ProfileCanonicalMergeService, ProfileReadinessService],
})
export class ProfilesModule {}
