import { Module } from "@nestjs/common";

import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { AdminResumesController } from "./admin-resumes.controller";
import { AdminResumesService } from "./admin-resumes.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminResumesController],
  providers: [AdminResumesService, RolesGuard],
})
export class AdminResumesModule {}
