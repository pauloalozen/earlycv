import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
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
import { OptionalJwtAuthGuard } from "../common/optional-jwt-auth.guard";
// Imports de VALOR (não `import type`): o ValidationPipe global precisa do
// metatype real dos DTOs de @Body/@Query.
// biome-ignore-start lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import { CreateMockInterviewCheckoutDto } from "./dto/create-checkout.dto";
import { GetMockInterviewPurchaseQueryDto } from "./dto/get-purchase-query.dto";
// biome-ignore-end lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import {
  canAccessMockInterview,
  canSimulateMockInterviewPayment,
} from "./mock-interview.config";
import { MockInterviewsService } from "./mock-interviews.service";

// Venda fechada para este usuário (MOCK_INTERVIEW_MODE): responde 404, como
// se o produto não existisse. Só barra o que inicia uma compra/pagamento.
function assertMockInterviewAvailable(
  user: AuthenticatedRequestUser | null | undefined,
) {
  if (!canAccessMockInterview(user)) {
    throw new NotFoundException({
      errorCode: "mock_interview_unavailable",
      message: "Entrevista simulada indisponível.",
    });
  }
}

@Controller("mock-interviews")
export class MockInterviewsController {
  constructor(
    @Inject(MockInterviewsService)
    private readonly service: MockInterviewsService,
  ) {}

  // Público: preço e regras exibidos na landing (sem nenhum contato). Com a
  // flag em "admin", só responde para staff autenticado.
  @UseGuards(OptionalJwtAuthGuard)
  @Get("offer")
  offer(@AuthenticatedUser() user: AuthenticatedRequestUser | null) {
    assertMockInterviewAvailable(user);
    return this.service.getOffer();
  }

  @UseGuards(JwtAuthGuard)
  @Post("checkout")
  checkout(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Body() body: CreateMockInterviewCheckoutDto,
  ) {
    assertMockInterviewAvailable(user);
    return this.service.createCheckout(user.id, body);
  }

  // Pedidos já feitos ficam acessíveis em qualquer modo da flag.
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

  // Dados para montar o Payment Brick (checkout dentro do EarlyCV).
  @UseGuards(JwtAuthGuard)
  @Get("purchases/:id/brick")
  brickCheckout(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
  ) {
    assertMockInterviewAvailable(user);
    return this.service.getBrickCheckout(user.id, id, {
      canSimulatePayment: canSimulateMockInterviewPayment(user),
    });
  }

  // Pagamento simulado para testar o pós-pagamento (só fora de produção,
  // com MOCK_INTERVIEW_SIMULATED_PAYMENT=true, staff no próprio pedido).
  // Fora disso responde 404, como se a rota não existisse.
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post("purchases/:id/simulate-payment")
  simulatePayment(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
  ) {
    if (!canSimulateMockInterviewPayment(user)) {
      throw new NotFoundException();
    }
    return this.service.simulatePayment(user.id, id);
  }

  // Envio do formulário do Brick (cartão com token ou Pix).
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post("purchases/:id/brick/pay")
  brickPay(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    assertMockInterviewAvailable(user);
    return this.service.payWithBrick(user.id, id, body);
  }

  // Notificação do Mercado Pago (notification_url do pagamento). Nunca passa
  // pela flag: um pagamento iniciado precisa ser processado mesmo com a venda
  // desligada depois.
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
