import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { ProfileCanonicalMergeService } from "./profile-canonical-merge.service";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfileCanonicalMergeService],
})
export class ProfilesModule {}
