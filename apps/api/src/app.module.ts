import { Module } from "@nestjs/common";

import { EnvModule } from "./config/env.module";
import { HealthModule } from "./health/health.module";
import { InfraModule } from "./infra/infra.module";

@Module({
  imports: [EnvModule, InfraModule, HealthModule],
})
export class AppModule {}
