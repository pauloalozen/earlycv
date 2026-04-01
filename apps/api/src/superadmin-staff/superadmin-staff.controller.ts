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
import { CreateStaffUserDto } from "../auth/dto/create-staff-user.dto";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { UpdateSuperadminStaffDto } from "./dto/update-superadmin-staff.dto";
import { UpdateSuperadminStaffRoleDto } from "./dto/update-superadmin-staff-role.dto";
import { SuperadminStaffService } from "./superadmin-staff.service";

const superadminStaffValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("superadmin")
@Controller("superadmin/staff")
export class SuperadminStaffController {
  constructor(
    @Inject(SuperadminStaffService)
    private readonly superadminStaffService: SuperadminStaffService,
  ) {}

  @Get()
  list() {
    return this.superadminStaffService.list();
  }

  @Post()
  create(
    @Body(
      new ValidationPipe({
        ...superadminStaffValidationOptions,
        expectedType: CreateStaffUserDto,
      }),
    )
    dto: CreateStaffUserDto,
  ) {
    return this.superadminStaffService.create(dto);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...superadminStaffValidationOptions,
        expectedType: UpdateSuperadminStaffDto,
      }),
    )
    dto: UpdateSuperadminStaffDto,
  ) {
    return this.superadminStaffService.update(id, dto);
  }

  @Patch(":id/role")
  updateRole(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...superadminStaffValidationOptions,
        expectedType: UpdateSuperadminStaffRoleDto,
      }),
    )
    dto: UpdateSuperadminStaffRoleDto,
  ) {
    return this.superadminStaffService.updateRole(id, dto);
  }
}
