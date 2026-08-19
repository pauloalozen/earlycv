import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import type { ResumeStatus, UserPlanType } from "@prisma/client";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminUsersService } from "./admin-users.service";
import { SetAdminUserAnalysisCreditsDto } from "./dto/set-admin-user-analysis-credits.dto";
import { SetAdminUserCreditsDto } from "./dto/set-admin-user-credits.dto";
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
  list(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("planType") planType?: UserPlanType,
    @Query("query") query?: string,
    @Query("status") status?: string,
  ) {
    return this.adminUsersService.list({
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      page: page ? Number.parseInt(page, 10) : undefined,
      planType,
      query,
      status,
    });
  }

  // Precisa vir antes de @Get(":id") — senao o Nest casa "/resumes" como
  // valor do param :id.
  @Get("resumes")
  listResumes(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("kind") kind?: "master" | "base" | "adapted",
    @Query("query") query?: string,
    @Query("status") status?: ResumeStatus,
  ) {
    return this.adminUsersService.listResumes({
      kind,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      page: page ? Number.parseInt(page, 10) : undefined,
      query,
      status,
    });
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

  @Patch(":id/credits")
  setCredits(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...adminUsersValidationOptions,
        expectedType: SetAdminUserCreditsDto,
      }),
    )
    dto: SetAdminUserCreditsDto,
  ) {
    return this.adminUsersService.setCredits(id, dto);
  }

  @Patch(":id/analysis-credits")
  setAnalysisCredits(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...adminUsersValidationOptions,
        expectedType: SetAdminUserAnalysisCreditsDto,
      }),
    )
    dto: SetAdminUserAnalysisCreditsDto,
  ) {
    return this.adminUsersService.setAnalysisCredits(id, dto);
  }

  @Delete(":id")
  deleteById(@Param("id") id: string) {
    return this.adminUsersService.deleteById(id);
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
