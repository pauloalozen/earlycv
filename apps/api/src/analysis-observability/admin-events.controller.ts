import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import type { AnalysisRequest } from "../analysis-protection/types";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminEventsEmitterService } from "./admin-events-emitter.service";
import { EmitAdminEventsDto } from "./dto/emit-admin-events.dto";
import { JourneySessionClassificationService } from "./journey-session-classification.service";
import { VisitorLifecycleClassificationService } from "./visitor-lifecycle-classification.service";

const emitAdminEventsValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/analysis-observability/events")
export class AdminEventsController {
  constructor(
    @Inject(AdminEventsEmitterService)
    private readonly adminEventsEmitterService: AdminEventsEmitterService,
    @Inject(JourneySessionClassificationService)
    private readonly journeySessionClassificationService: JourneySessionClassificationService,
    @Inject(VisitorLifecycleClassificationService)
    private readonly visitorLifecycleClassificationService: VisitorLifecycleClassificationService,
  ) {}

  @Get("catalog")
  catalog() {
    return this.adminEventsEmitterService.buildCatalog();
  }

  @Post("emit")
  emit(
    @Req() req: AnalysisRequest,
    @Body(
      new ValidationPipe({
        ...emitAdminEventsValidationOptions,
        expectedType: EmitAdminEventsDto,
      }),
    )
    dto: EmitAdminEventsDto,
  ) {
    return this.adminEventsEmitterService.emit(dto, req.analysisContext);
  }

  @Get("journey-classification/:sessionInternalId")
  async journeyClassification(
    @Param("sessionInternalId") sessionInternalId: string,
  ) {
    const trimmed = sessionInternalId.trim();
    if (!trimmed) {
      throw new BadRequestException("sessionInternalId is required");
    }

    const classification =
      await this.journeySessionClassificationService.classify(trimmed);

    return { sessionInternalId: trimmed, classification };
  }

  @Get("visitor-lifecycle/:visitorId/:sessionInternalId")
  async visitorLifecycle(
    @Param("visitorId") visitorId: string,
    @Param("sessionInternalId") sessionInternalId: string,
  ) {
    const trimmedVisitorId = visitorId.trim();
    const trimmedSessionInternalId = sessionInternalId.trim();
    if (!trimmedVisitorId || !trimmedSessionInternalId) {
      throw new BadRequestException(
        "visitorId and sessionInternalId are required",
      );
    }

    const classification =
      await this.visitorLifecycleClassificationService.classify(
        trimmedVisitorId,
        trimmedSessionInternalId,
      );

    return {
      visitorId: trimmedVisitorId,
      sessionInternalId: trimmedSessionInternalId,
      classification,
    };
  }
}
