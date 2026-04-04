import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { CvAdaptationController } from "./cv-adaptation.controller";
import { CvAdaptationService } from "./cv-adaptation.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CvAdaptationController],
  providers: [CvAdaptationService],
})
export class CvAdaptationModule {}
