import { Module } from "@nestjs/common";

import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { AdminPendingController } from "./admin-pending.controller";
import { AdminPendingService } from "./admin-pending.service";

@Module({
  controllers: [AdminPendingController],
  imports: [DatabaseModule],
  providers: [AdminPendingService, RolesGuard],
})
export class AdminPendingModule {}
