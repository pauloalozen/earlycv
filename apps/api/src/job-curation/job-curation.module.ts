import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { JobCurationController } from "./job-curation.controller";
import { JobCurationService } from "./job-curation.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [JobCurationController],
  providers: [JobCurationService, JwtAuthGuard, RolesGuard],
})
export class JobCurationModule {}
