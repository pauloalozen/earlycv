import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminUsersService } from "./admin-users.service";
import { StartAssistedSessionDto } from "./dto/start-assisted-session.dto";
import { UpdateAdminUserDto } from "./dto/update-admin-user.dto";
import { UpdateAdminUserPlanDto } from "./dto/update-admin-user-plan.dto";
import { UpdateAdminUserStatusDto } from "./dto/update-admin-user-status.dto";

const adminUsersValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/users")
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService)
    private readonly adminUsersService: AdminUsersService,
  ) {}

  @Get()
  list() {
    return this.adminUsersService.list();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.adminUsersService.getById(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...adminUsersValidationOptions,
        expectedType: UpdateAdminUserDto,
      }),
    )
    dto: UpdateAdminUserDto,
  ) {
    return this.adminUsersService.update(id, dto);
  }

  @Patch(":id/plan")
  updatePlan(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...adminUsersValidationOptions,
        expectedType: UpdateAdminUserPlanDto,
      }),
    )
    dto: UpdateAdminUserPlanDto,
  ) {
    return this.adminUsersService.updatePlan(id, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...adminUsersValidationOptions,
        expectedType: UpdateAdminUserStatusDto,
      }),
    )
    dto: UpdateAdminUserStatusDto,
  ) {
    return this.adminUsersService.updateStatus(id, dto);
  }

  @Post(":id/assisted-session")
  startAssistedSession(
    @Param("id") id: string,
    @AuthenticatedUser() operator: AuthenticatedRequestUser,
    @Body(
      new ValidationPipe({
        ...adminUsersValidationOptions,
        expectedType: StartAssistedSessionDto,
      }),
    )
    dto: StartAssistedSessionDto,
  ) {
    return this.adminUsersService.startAssistedSession(operator.id, id, dto);
  }
}
