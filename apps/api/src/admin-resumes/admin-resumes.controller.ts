import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminResumesService } from "./admin-resumes.service";
import { UpdateAdminResumeDto } from "./dto/update-admin-resume.dto";

const adminResumesValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/resumes")
export class AdminResumesController {
  constructor(
    @Inject(AdminResumesService)
    private readonly adminResumesService: AdminResumesService,
  ) {}

  @Get()
  list() {
    return this.adminResumesService.list();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.adminResumesService.getById(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...adminResumesValidationOptions,
        expectedType: UpdateAdminResumeDto,
      }),
    )
    dto: UpdateAdminResumeDto,
  ) {
    return this.adminResumesService.update(id, dto);
  }

  @Post(":id/set-master")
  @HttpCode(200)
  setMaster(@Param("id") id: string) {
    return this.adminResumesService.setMaster(id);
  }
}
