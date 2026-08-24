import type { CanActivate } from "@nestjs/common";
import { Injectable } from "@nestjs/common";

// Ghost mode deixou de controlar acesso (ver ADR do modo ghost do Radar,
// ago/2026): agora só oculta o link de navegação pra quem não é admin,
// via canSeeJobsLink no front — os endpoints públicos ficam sempre
// acessíveis, inclusive pra crawlers. Guard mantido como no-op (em vez de
// removido dos controllers) pra reativar bloqueio de acesso rápido se
// precisar de novo, sem reconectar guard em 4 endpoints.
@Injectable()
export class PublicJobsGhostModeGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
