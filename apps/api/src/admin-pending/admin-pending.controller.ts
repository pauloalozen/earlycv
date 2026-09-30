import {
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminPendingService } from "./admin-pending.service";
// biome-ignore lint/style/useImportType: DTO precisa de import em runtime para reflection do NestJS ValidationPipe
import { ListPendingDto } from "./dto/list-pending.dto";

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/pending")
export class AdminPendingController {
  constructor(
    @Inject(AdminPendingService)
    private readonly adminPendingService: AdminPendingService,
  ) {}

  @Get()
  list(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
        expectedType: ListPendingDto,
      }),
    )
    dto: ListPendingDto,
  ) {
    return this.adminPendingService.list(dto);
  }
}
