import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { EmailDispatchModule } from "../email-dispatch/email-dispatch.module";
import { PlansModule } from "../plans/plans.module";
import { AdminEmailsController } from "./admin-emails.controller";
import { AdminEmailsService } from "./admin-emails.service";

@Module({
  // PlansModule exporta a recuperação de confirmações de compra.
  imports: [DatabaseModule, EmailDispatchModule, PlansModule],
  controllers: [AdminEmailsController],
  providers: [AdminEmailsService],
})
export class AdminEmailsModule {}
