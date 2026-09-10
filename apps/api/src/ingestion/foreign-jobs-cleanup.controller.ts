import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ForeignJobsCleanupService } from "./foreign-jobs-cleanup.service";

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/foreign-jobs-cleanup")
export class ForeignJobsCleanupController {
  constructor(
    @Inject(ForeignJobsCleanupService)
    private readonly service: ForeignJobsCleanupService,
  ) {}

  @Get("preview")
  async preview() {
    return this.service.preview();
  }

  @Post("apply")
  @HttpCode(200)
  async apply(@Body("dryRun") dryRun: boolean | undefined) {
    return this.service.apply({ dryRun: dryRun !== false });
  }
}
