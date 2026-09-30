import { Module } from "@nestjs/common";

import { WebRevalidationService } from "./web-revalidation.service";

@Module({
  exports: [WebRevalidationService],
  providers: [WebRevalidationService],
})
export class WebRevalidationModule {}
