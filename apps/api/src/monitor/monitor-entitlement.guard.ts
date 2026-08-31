import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../common/authenticated-user.decorator";
import { MonitorEntitlementService } from "./monitor-entitlement.service";

// Aplicado DEPOIS de JwtAuthGuard (ordem no @UseGuards importa — precisa
// de request.user já populado). Único ponto de enforcement nos endpoints
// HTTP do Monitor — consulta MonitorEntitlementService, nunca reimplementa
// a regra. Rotas públicas (webhook do Resend, unsubscribe) ficam fora de
// MonitorController de propósito (MonitorPublicController) e por isso
// nunca passam por este guard — descadastrar e-mail não pode depender de
// ter acesso ao produto.
@Injectable()
export class MonitorEntitlementGuard implements CanActivate {
  constructor(
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>();

    const user = request.user;
    if (!user) {
      // JwtAuthGuard já deveria ter barrado isso antes — defensivo.
      throw new ForbiddenException("monitor access denied");
    }

    const result = await this.entitlementService.canUseMonitor(user.id);
    if (!result.allowed) {
      throw new ForbiddenException("monitor access denied");
    }

    return true;
  }
}
