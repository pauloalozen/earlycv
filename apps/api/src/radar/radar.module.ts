import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { MatchingEngine } from "./matching.engine";
import { UserRadarProfileService } from "./user-radar-profile.service";

@Module({
  imports: [DatabaseModule],
  providers: [UserRadarProfileService, MatchingEngine],
  exports: [UserRadarProfileService, MatchingEngine],
})
export class RadarModule {}
