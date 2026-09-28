import { Module } from "@nestjs/common";

import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { AdminAffiliatesController } from "./admin-affiliates.controller";
import { AdminAffiliatesService } from "./admin-affiliates.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminAffiliatesController],
  providers: [AdminAffiliatesService, RolesGuard],
})
export class AdminAffiliatesModule {}
