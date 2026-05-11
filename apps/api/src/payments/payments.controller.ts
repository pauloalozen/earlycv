import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
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
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
  ) {}

  @Get("checkout/:checkoutId/status")
  getCheckoutStatus(
    @AuthenticatedUser() user: { id: string },
    @Param("checkoutId") checkoutId: string,
    @Query("payment_id") paymentId?: string,
    @Query("preference_id") preferenceId?: string,
    @Query("status") status?: string,
    @Query("collection_status") collectionStatus?: string,
  ) {
    if (paymentId || preferenceId || status || collectionStatus) {
      this.logger.log(
        `[checkout:status] checkoutId=${checkoutId} user=${user.id} payment_id=${paymentId ?? "-"} preference_id=${preferenceId ?? "-"} status=${status ?? collectionStatus ?? "-"}`,
      );
    }
    return this.paymentsService.getCheckoutStatus(user.id, checkoutId);
  }

  @Get("brick/checkout/:purchaseId")
  getBrickCheckoutData(
    @AuthenticatedUser() user: { id: string },
    @Param("purchaseId") purchaseId: string,
  ) {
    return this.paymentsService.getBrickCheckoutData(user.id, purchaseId);
  }

  @Post("brick/:purchaseId/pay")
  submitBrickPayment(
    @AuthenticatedUser() user: { id: string },
    @Param("purchaseId") purchaseId: string,
    @Body() payload: unknown,
  ) {
    return this.paymentsService.submitBrickPayment(user.id, purchaseId, payload);
  }

  @Get("admin/list")
  @UseGuards(RolesGuard)
  @InternalRoles("superadmin")
  listPayments(
    @Query("status") status?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.paymentsService.listPayments({
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
