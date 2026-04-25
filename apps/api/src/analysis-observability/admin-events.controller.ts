import {
  Body,
  Controller,
  Get,
  Inject,
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
}
