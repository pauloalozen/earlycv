import { Global, Module } from "@nestjs/common";
import { Ga4MeasurementService } from "./ga4-measurement.service";

@Global()
@Module({
  providers: [Ga4MeasurementService],
  exports: [Ga4MeasurementService],
})
export class Ga4Module {}
