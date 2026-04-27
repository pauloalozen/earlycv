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

  @Get("admin/list")
  @UseGuards(RolesGuard)
  @InternalRoles("superadmin")
  listPayments(
    @Query("type") type?: "plan" | "adaptation",
    @Query("status") status?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.paymentsService.listPayments({
      type,
      status,
      userId,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("admin/:checkoutId")
  @UseGuards(RolesGuard)
  @InternalRoles("superadmin")
  getPaymentDetail(@Param("checkoutId") checkoutId: string) {
    return this.paymentsService.getPaymentDetail(checkoutId);
  }

  @Post("admin/reconcile-all")
  @UseGuards(RolesGuard)
  @InternalRoles("superadmin")
  reconcileAll(@Query("limit") limit?: string) {
    return this.paymentsService.reconcilePending(
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Post("admin/reconcile/:checkoutId")
  @UseGuards(RolesGuard)
  @InternalRoles("superadmin")
  reconcileOne(@Param("checkoutId") checkoutId: string) {
    return this.paymentsService.reconcileOne(checkoutId);
  }
}
