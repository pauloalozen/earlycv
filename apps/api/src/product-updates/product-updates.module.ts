import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { ProductUpdateSubscriptionService } from "./product-update-subscription.service";
import { ProductUpdateTemplateService } from "./product-update-template.service";

@Module({
  imports: [DatabaseModule, EmailModule],
  providers: [ProductUpdateSubscriptionService, ProductUpdateTemplateService],
  exports: [ProductUpdateSubscriptionService, ProductUpdateTemplateService],
})
export class ProductUpdatesModule {}
