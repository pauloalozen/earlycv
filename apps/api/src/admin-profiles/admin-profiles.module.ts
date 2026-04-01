import { Module } from "@nestjs/common";

import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { AdminProfilesController } from "./admin-profiles.controller";
import { AdminProfilesService } from "./admin-profiles.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminProfilesController],
  providers: [AdminProfilesService, RolesGuard],
})
export class AdminProfilesModule {}
