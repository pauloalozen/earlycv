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
// Guest permanece SEMPRE no legado nesta fase — decisão deliberada do
// plano ("Guest permanece no legado durante o primeiro piloto, a menos
// que exista um mecanismo controlado específico pra testar guest").
// Optamos pela alternativa mais simples permitida pelo plano: não
// implementar um segundo mecanismo (allowlist por guestSessionHash) nesta
// fase — não há necessidade concreta ainda de testar o caminho de guest
// isoladamente do piloto de usuário autenticado, e o plano permite adiar
// essa decisão para quando existir essa necessidade real. Isso é obtido de
// graça pela própria forma da função: ela só considera admin/allowlist
// quando `context.userId` está presente; todo fluxo de guest (sem userId
// resolvido) cai direto no fallback da flag global.
//
// Centralização (exigência do plano): todo lugar que decidia essa lógica
// sozinho (resumes.service.ts, cv-adaptation.service.ts) passa a chamar
// SOMENTE isEnabledFor() a partir daqui — nenhum service reimplementa a
// checagem de admin/allowlist por conta própria.
import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { isCvStructuredProfilePipelineEnabled } from "./cv-processing.flags";

export type CvStructuredProfilePipelineContext = {
  userId?: string;
  // Reservado para um eventual mecanismo específico de piloto de guest
  // (não implementado nesta fase — ver nota acima). Mantido no tipo para
  // que os call sites já passem o dado disponível (ex.: guest session
  // hash já computado) sem precisar de outro refactor quando/se esse
  // mecanismo for adicionado.
  guestSessionHash?: string;
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
    // Master switch: continua valendo para todo mundo, inclusive guest,
    // exatamente como hoje — nada nesta fase muda o comportamento da flag
    // global ligada.
    if (isCvStructuredProfilePipelineEnabled()) {
      return true;
    }

    // Sem userId (guest, ou contexto que não resolveu um dono ainda):
    // nesta fase, nunca ligado fora da flag global — decisão deliberada
    // (ver cabeçalho do arquivo).
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
