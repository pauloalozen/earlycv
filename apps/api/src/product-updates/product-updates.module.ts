import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { ProductUpdateEmailService } from "./product-update-email.service";
import { ProductUpdateSubscriptionService } from "./product-update-subscription.service";
import { ProductUpdateTemplateService } from "./product-update-template.service";
import { ProductUpdatesService } from "./product-updates.service";

@Module({
  imports: [DatabaseModule, EmailModule],
  providers: [
    ProductUpdateSubscriptionService,
    ProductUpdateTemplateService,
    ProductUpdateEmailService,
    ProductUpdatesService,
  ],
  exports: [
    ProductUpdateSubscriptionService,
    ProductUpdateTemplateService,
    ProductUpdateEmailService,
    ProductUpdatesService,
  ],
})
export class ProductUpdatesModule {}
