import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { ProductUpdatesModule } from "../product-updates/product-updates.module";
import { AdminProductUpdatesController } from "./admin-product-updates.controller";
import { AdminProductUpdatesService } from "./admin-product-updates.service";

@Module({
  imports: [DatabaseModule, ProductUpdatesModule],
  controllers: [AdminProductUpdatesController],
  providers: [AdminProductUpdatesService],
})
export class AdminProductUpdatesModule {}
