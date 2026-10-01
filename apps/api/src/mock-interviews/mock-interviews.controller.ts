import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
// Imports de VALOR (não `import type`): o ValidationPipe global precisa do
// metatype real dos DTOs de @Body/@Query.
// biome-ignore-start lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import { CreateMockInterviewCheckoutDto } from "./dto/create-checkout.dto";
import { GetMockInterviewPurchaseQueryDto } from "./dto/get-purchase-query.dto";
// biome-ignore-end lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import { MockInterviewsService } from "./mock-interviews.service";

@Controller("mock-interviews")
export class MockInterviewsController {
  constructor(
    @Inject(MockInterviewsService)
    private readonly service: MockInterviewsService,
  ) {}

  // Público: preço e regras exibidos na landing (sem nenhum contato).
  @Get("offer")
  offer() {
    return this.service.getOffer();
  }

  @UseGuards(JwtAuthGuard)
  @Post("checkout")
  checkout(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Body() body: CreateMockInterviewCheckoutDto,
  ) {
    return this.service.createCheckout(user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("purchases")
  listMine(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.service.listMine(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("purchases/:id")
  getMine(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Query() query: GetMockInterviewPurchaseQueryDto,
  ) {
    return this.service.getMine(user.id, id, { refresh: query.refresh });
  }

  // Notificação do Mercado Pago (notification_url da preferência).
  @SkipThrottle()
  @HttpCode(200)
  @Post("webhook/mercadopago")
  webhook(
    @Body() body: unknown,
    @Headers("x-signature") xSignature?: string,
    @Headers("x-request-id") xRequestId?: string,
  ) {
    return this.service.handleWebhook({ body, xSignature, xRequestId });
  }
}
