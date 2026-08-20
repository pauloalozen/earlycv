import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminTalentProfilesService } from "./admin-talent-profiles.service";
// biome-ignore lint/style/useImportType: DTO precisa de import em runtime para reflection do NestJS ValidationPipe
import { SearchTalentProfilesDto } from "./dto/search-talent-profiles.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/talent-profiles")
export class AdminTalentProfilesController {
  constructor(
    @Inject(AdminTalentProfilesService)
    private readonly adminTalentProfilesService: AdminTalentProfilesService,
  ) {}

  @Get()
  search(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: SearchTalentProfilesDto,
  ) {
    return this.adminTalentProfilesService.search(dto);
  }

  @Get(":id/cv-source")
  resolveCvSource(@Param("id") id: string) {
    return this.adminTalentProfilesService.resolveCvSource(id);
  }
}
