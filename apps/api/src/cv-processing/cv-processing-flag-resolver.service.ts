// Resolução CENTRALIZADA de "o pipeline canônico de CV está ligado para
// este contexto?" — Fase 3 (pré-rollout), plano
// docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, "Tarefa 2 —
// Ativação granular (allowlist)".
//
// Antes desta fase, isCvStructuredProfilePipelineEnabled() (cv-processing.flags.ts)
// era chamada diretamente por resumes.service.ts e cv-adaptation.service.ts —
// um "tudo ou nada" via uma única flag global. Esta fase introduz DUAS
// formas adicionais e controladas de ligar o pipeline para alvos
// específicos, sem tocar na flag global (que continua desligada por
// padrão):
//
//  1. Admin/superadmin (User.internalRole 'admin'|'superadmin', enum
//     InternalRole em schema.prisma): sempre ligado para esses usuários,
//     independente de estarem ou não na allowlist explícita abaixo — é o
//     caso mínimo exigido ("dá pra ligar só pra admin/superadmin").
//  2. Allowlist explícita por User.id, via
//     CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS (string separada
//     por vírgula, cada item um userId real da tabela User — NUNCA
//     e-mail). Formato escolhido por: (a) ser o mesmo já usado por outras
//     flags/allowlists do projeto via variável de ambiente simples,
//     comparação estrita, sem infra nova; (b) não exigir nenhuma migration
//     nem tabela nova para uma lista pequena e operacional (poucos
//     usuários controlados durante o piloto). Se a lista crescer além de
//     uma dúzia de entradas, migrar para uma tabela dedicada fica mais
//     barato que continuar redeployando a env var a cada mudança — decisão
//     adiada para quando (se) isso acontecer.
//
// Guest (sem userId resolvido): a flag global
// (CV_STRUCTURED_PROFILE_PIPELINE_ENABLED=true) liga o pipeline novo para
// guest exatamente como liga para usuário autenticado — mesmo master
// switch, sem allowlist dedicada. A Fase 3C havia introduzido uma
// allowlist por guestSessionHash para isso; foi removida porque exigia
// calcular e listar o hash de sessão de cada visitante manualmente, o que
// na prática tornava impossível testar o fluxo guest fora de produção.
//
// Centralização (exigência do plano): todo lugar que decidia essa lógica
// sozinho (resumes.service.ts, cv-adaptation.service.ts) passa a chamar
// SOMENTE isEnabledFor() a partir daqui — nenhum service reimplementa a
// checagem de admin/allowlist/guest por conta própria.
import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { isCvStructuredProfilePipelineEnabled } from "./cv-processing.flags";

export type CvStructuredProfilePipelineContext = {
  userId?: string;
};

const ADMIN_INTERNAL_ROLES = new Set(["admin", "superadmin"]);

// Exportado isoladamente para ser testável sem banco (parsing puro) e para
// nunca ser duplicado por outro código que precise só do parsing.
export function parsePipelineAllowlistUserIds(
  raw: string | undefined | null,
): ReadonlySet<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

export function isUserIdInPipelineAllowlist(userId: string): boolean {
  const raw = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS;
  return parsePipelineAllowlistUserIds(raw).has(userId);
}

@Injectable()
export class CvProcessingFlagResolverService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async isEnabledFor(
    context: CvStructuredProfilePipelineContext,
  ): Promise<boolean> {
    // Master switch: liga o pipeline novo para todo mundo, autenticado ou
    // guest — sem allowlist dedicada de guest (ver cabeçalho do arquivo).
    if (isCvStructuredProfilePipelineEnabled()) {
      return true;
    }

    // Sem userId (guest) e master switch desligado: não há mais nenhum
    // outro caminho de ativação para guest nesta fase.
    if (!context.userId) {
      return false;
    }

    if (isUserIdInPipelineAllowlist(context.userId)) {
      return true;
    }

    const user = await this.database.user.findUnique({
      where: { id: context.userId },
      select: { internalRole: true },
    });

    return !!user && ADMIN_INTERNAL_ROLES.has(user.internalRole);
  }
}
