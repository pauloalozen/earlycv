import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { PlansModule } from "../plans/plans.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [DatabaseModule, PlansModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
