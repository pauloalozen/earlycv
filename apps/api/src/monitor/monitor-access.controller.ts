import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { MonitorEntitlementService } from "./monitor-entitlement.service";

// Único ponto que o FRONTEND deve consultar pra saber o estado de acesso
// ao Monitor — deliberadamente só JwtAuthGuard, sem MonitorEntitlementGuard.
// Os endpoints funcionais do Monitor (MonitorController) usam o guard e
// simplesmente bloqueiam (403) quando não há acesso; esta rota existe pra
// responder mesmo nesse caso, porque é o que permite a UI decidir o que
// mostrar em vez de só herdar um erro genérico. Hoje sempre retorna
// allowed=true (política de lançamento); quando a política mudar pra
// assinatura, o front continua lendo só daqui — nenhum outro componente
// deve inspecionar plano/assinatura diretamente.
@UseGuards(JwtAuthGuard)
@Controller("monitor/access")
export class MonitorAccessController {
  constructor(
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  @Get()
  getAccess(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.entitlementService.canUseMonitor(user.id);
  }
}
