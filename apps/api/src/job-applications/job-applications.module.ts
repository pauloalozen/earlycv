import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { JobApplicationsController } from "./job-applications.controller";
import { JobApplicationsService } from "./job-applications.service";

@Module({
  imports: [DatabaseModule],
  controllers: [JobApplicationsController],
  providers: [JobApplicationsService],
  exports: [JobApplicationsService],
})
export class JobApplicationsModule {}
