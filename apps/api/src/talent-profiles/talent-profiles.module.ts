import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { TalentProfileCaptureService } from "./talent-profile-capture.service";

@Module({
  imports: [DatabaseModule],
  providers: [TalentProfileCaptureService],
  exports: [TalentProfileCaptureService],
})
export class TalentProfilesModule {}
