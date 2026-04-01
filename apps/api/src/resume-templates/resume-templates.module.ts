import { Module } from "@nestjs/common";

import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { ResumeTemplatesController } from "./resume-templates.controller";
import { ResumeTemplatesService } from "./resume-templates.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ResumeTemplatesController],
  providers: [ResumeTemplatesService, RolesGuard],
})
export class ResumeTemplatesModule {}
