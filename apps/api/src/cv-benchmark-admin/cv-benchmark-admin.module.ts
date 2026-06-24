import { Module } from "@nestjs/common";

import { CvAdaptationModule } from "../cv-adaptation/cv-adaptation.module";
import { CvBenchmarkAdminController } from "./cv-benchmark-admin.controller";

@Module({
  imports: [CvAdaptationModule],
  controllers: [CvBenchmarkAdminController],
})
export class CvBenchmarkAdminModule {}
