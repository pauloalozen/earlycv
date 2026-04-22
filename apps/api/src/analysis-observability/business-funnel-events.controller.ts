import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import type { AnalysisRequest } from "../analysis-protection/types";
import {
  BusinessFunnelEventService,
  type RecordBusinessFunnelEventInput,
} from "./business-funnel-event.service";

@Controller("analysis-observability")
export class BusinessFunnelEventsController {
  constructor(
    @Inject(BusinessFunnelEventService)
    private readonly businessFunnelEventService: BusinessFunnelEventService,
  ) {}

  @Post("business-funnel-events")
  async createBusinessFunnelEvent(
    @Req() req: AnalysisRequest,
    @Body() payload: RecordBusinessFunnelEventInput,
  ) {
    const result = await this.businessFunnelEventService.record(
      payload,
      req.analysisContext,
      "frontend",
    );

    return {
      accepted: result.ingested,
      deduplicated: !result.ingested,
      eventId: result.event.id,
    };
  }
}
