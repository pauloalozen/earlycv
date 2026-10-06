import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminMockInterviewsService } from "./admin-mock-interviews.service";
// biome-ignore-start lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import { AdminListMockInterviewsQueryDto } from "./dto/admin-list-query.dto";
import { AdminUpdateMockInterviewDto } from "./dto/admin-update.dto";
// biome-ignore-end lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/mock-interviews")
export class AdminMockInterviewsController {
  constructor(
    @Inject(AdminMockInterviewsService)
    private readonly service: AdminMockInterviewsService,
  ) {}

  @Get()
  list(@Query() query: AdminListMockInterviewsQueryDto) {
    return this.service.list(query);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: AdminUpdateMockInterviewDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.service.update(id, admin.id, body);
  }
}
