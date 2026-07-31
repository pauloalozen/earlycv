import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { UserRadarProfileService } from "./user-radar-profile.service";

@Module({
  imports: [DatabaseModule],
  providers: [UserRadarProfileService],
  exports: [UserRadarProfileService],
})
export class RadarModule {}
