import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { CvUnlocksController } from "./cv-unlocks.controller";
import { CvUnlocksService } from "./cv-unlocks.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CvUnlocksController],
  providers: [CvUnlocksService],
})
export class CvUnlocksModule {}
