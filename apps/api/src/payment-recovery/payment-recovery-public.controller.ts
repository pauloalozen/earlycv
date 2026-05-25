import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthenticatedUser } from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../common/optional-jwt-auth.guard";
import { PaymentRecoveryClickService } from "./payment-recovery-click.service";
import { PaymentRecoveryPublicRateLimitGuard } from "./payment-recovery-public-rate-limit.guard";
import { PaymentRecoveryResumeService } from "./payment-recovery-resume.service";

@Controller()
export class PaymentRecoveryPublicController {
  constructor(
    @Inject(PaymentRecoveryClickService)
    private readonly clickService: PaymentRecoveryClickService,
    @Inject(PaymentRecoveryResumeService)
    private readonly resumeService: PaymentRecoveryResumeService,
  ) {}

  @Get("payment-recovery/:token")
  @UseGuards(OptionalJwtAuthGuard, PaymentRecoveryPublicRateLimitGuard)
  async recover(
    @Param("token") token: string,
    @AuthenticatedUser() user: { id: string } | null,
    @Req() request: Request,
    @Res() response: Response,
    @Query("returnUrl") returnUrl?: string,
  ) {
    const result = await this.clickService.handleTokenClick({
      token,
      currentUserId: user?.id ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      requestId: request.headers["x-request-id"] as string | undefined,
      returnUrl: returnUrl ?? null,
    });
    return response.redirect(result.redirectUrl);
  }

  @Get("payment-recovery/bridge/:token")
  @UseGuards(JwtAuthGuard)
  async resumeBridge(
    @Param("token") token: string,
    @AuthenticatedUser() user: { id: string },
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const resumed = await this.resumeService.resumeCheckoutForToken({
      token,
      currentUserId: user.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      requestId: request.headers["x-request-id"] as string | undefined,
    });
    return response.redirect(resumed.checkoutUrl);
  }
}
