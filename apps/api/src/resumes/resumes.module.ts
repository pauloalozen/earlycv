import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { ResumesController } from "./resumes.controller";
import { ResumesService } from "./resumes.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ResumesController],
  providers: [ResumesService],
})
export class ResumesModule {}
