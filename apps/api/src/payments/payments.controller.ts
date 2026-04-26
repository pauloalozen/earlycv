import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AuthenticatedUser } from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { PaymentsService } from "./payments.service";

@Controller("payments")
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
  ) {}

  @Get("checkout/:checkoutId/status")
  getCheckoutStatus(
    @AuthenticatedUser() user: { id: string },
    @Param("checkoutId") checkoutId: string,
  ) {
    return this.paymentsService.getCheckoutStatus(user.id, checkoutId);
  }

  @Post("admin/reconcile")
  @UseGuards(RolesGuard)
  @InternalRoles("superadmin")
  reconcile(@Query("limit") limit?: string) {
    return this.paymentsService.reconcilePending(
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
