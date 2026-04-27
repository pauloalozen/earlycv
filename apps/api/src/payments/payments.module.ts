import { Module } from "@nestjs/common";

import { CvAdaptationModule } from "../cv-adaptation/cv-adaptation.module";
import { DatabaseModule } from "../database/database.module";
import { PlansModule } from "../plans/plans.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [DatabaseModule, PlansModule, CvAdaptationModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
