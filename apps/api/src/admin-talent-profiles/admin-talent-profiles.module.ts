import { Module } from "@nestjs/common";

import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { AdminTalentProfilesController } from "./admin-talent-profiles.controller";
import { AdminTalentProfilesService } from "./admin-talent-profiles.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminTalentProfilesController],
  providers: [AdminTalentProfilesService, RolesGuard],
})
export class AdminTalentProfilesModule {}
