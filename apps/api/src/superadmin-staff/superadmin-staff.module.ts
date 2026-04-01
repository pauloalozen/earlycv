import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { SuperadminStaffController } from "./superadmin-staff.controller";
import { SuperadminStaffService } from "./superadmin-staff.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [SuperadminStaffController],
  providers: [SuperadminStaffService, RolesGuard],
})
export class SuperadminStaffModule {}
