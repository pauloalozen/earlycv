import { Controller, Get, Module, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";

@Controller("internal-test")
class InternalTestController {
  @Get("admin-check")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @InternalRoles("admin", "superadmin")
  adminCheck() {
    return { ok: true } as const;
  }
}

@Module({
  controllers: [InternalTestController],
  providers: [RolesGuard],
})
export class InternalTestModule {}
