import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { MatchingEngine } from "./matching.engine";
import { RadarController } from "./radar.controller";
import { UserRadarProfileService } from "./user-radar-profile.service";

@Module({
  imports: [DatabaseModule],
  controllers: [RadarController],
  providers: [UserRadarProfileService, MatchingEngine],
  exports: [UserRadarProfileService, MatchingEngine],
})
export class RadarModule {}
