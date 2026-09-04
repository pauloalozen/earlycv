import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { MonitorModule } from "../monitor/monitor.module";
import { RadarModule } from "../radar/radar.module";
import { AdminMonitorController } from "./admin-monitor.controller";
import { AdminMonitorService } from "./admin-monitor.service";

@Module({
  imports: [DatabaseModule, RadarModule, MonitorModule],
  controllers: [AdminMonitorController],
  providers: [AdminMonitorService],
})
export class AdminMonitorModule {}
