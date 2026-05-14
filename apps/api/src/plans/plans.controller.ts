import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Param,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import { AuthenticatedUser } from "../common/authenticated-user.decorator";
import { summarizeWebhookPayload } from "../common/analytics-sanitization";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CreatePlanCheckoutDto } from "./dto/create-plan-checkout.dto";
import { PlansService } from "./plans.service";

@Controller("plans")
export class PlansController {
  private readonly logger = new Logger(PlansController.name);

  constructor(
    @Inject(PlansService) private readonly plansService: PlansService,
  ) {}

  @Post("checkout")
  @UseGuards(JwtAuthGuard)
  createCheckout(
    @AuthenticatedUser() user: { id: string },
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: CreatePlanCheckoutDto,
      }),
    )
    dto: CreatePlanCheckoutDto,
  ) {
    return this.plansService.createCheckout(
      user.id,
      dto.planId,
      dto.adaptationId,
    );
  }

  @Post("checkout/:purchaseId/resume")
  @UseGuards(JwtAuthGuard)
  resumeCheckout(
    @AuthenticatedUser() user: { id: string },
    @Param("purchaseId") purchaseId: string,
  ) {
    return this.plansService.resumeCheckout(user.id, purchaseId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMyPlan(@AuthenticatedUser() user: { id: string }) {
    return this.plansService.getPlanInfo(user.id);
  }

  @Get("purchases/me")
  @UseGuards(JwtAuthGuard)
  listMyPurchases(@AuthenticatedUser() user: { id: string }) {
    return this.plansService.listMyPurchases(user.id);
  }

  @Post("webhook/:provider")
  webhook(
    @Param("provider") provider: string,
    @Body() body: unknown,
    @Headers("x-signature") xSignature?: string,
    @Headers("x-request-id") xRequestId?: string,
  ) {
    const summary = summarizeWebhookPayload(body);
    this.logger.log(
      `[webhook:plans:${provider}] received sig=${xSignature ? "present" : "absent"} reqId=${xRequestId ?? "-"} hasBody=${String(summary.hasBody)} eventType=${summary.eventType ?? "-"} action=${summary.action ?? "-"} paymentId=${summary.paymentId ?? "-"} keys=${summary.keys.join(",")}`,
    );
    this.plansService.verifyWebhookSignature(
      provider,
      body,
      xSignature,
      xRequestId,
    );
    return this.plansService.handleWebhook(provider, body);
  }
}
