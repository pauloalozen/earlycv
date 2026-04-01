import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminProfilesService } from "./admin-profiles.service";
import { UpdateAdminProfileDto } from "./dto/update-admin-profile.dto";

const adminProfilesValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/profiles")
export class AdminProfilesController {
  constructor(
    @Inject(AdminProfilesService)
    private readonly adminProfilesService: AdminProfilesService,
  ) {}

  @Get()
  list() {
    return this.adminProfilesService.list();
  }

  @Get(":userId")
  getByUserId(@Param("userId") userId: string) {
    return this.adminProfilesService.getByUserId(userId);
  }

  @Patch(":userId")
  update(
    @Param("userId") userId: string,
    @Body(
      new ValidationPipe({
        ...adminProfilesValidationOptions,
        expectedType: UpdateAdminProfileDto,
      }),
    )
    dto: UpdateAdminProfileDto,
  ) {
    return this.adminProfilesService.update(userId, dto);
  }
}
