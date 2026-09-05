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
// Fase 3C, item 6 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
// "6. Pilotar guest e claim") — SUBSTITUI a decisão anterior ("guest
// permanece sempre no legado nesta fase"). Agora existe um mecanismo
// controlado específico para ligar o pipeline novo para guest: allowlist
// por `guestSessionHash` via CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES
// (mesmo formato/convenção da allowlist de userId acima — string separada
// por vírgula, cada item um hash SHA-256 de sessão já computado pelo
// chamador via hashGuestSessionToken(), NUNCA um dado de identidade
// pessoal como e-mail; default vazia).
//
// Decisão fechada sobre a interação com a flag global (o plano pede
// explicitamente para decidir isto e documentar): a flag global
// (CV_STRUCTURED_PROFILE_PIPELINE_ENABLED=true) NÃO liga mais guest
// sozinha — mudança de comportamento deliberada em relação à Fase 3
// original. Motivo: a exigência do item 6 é "impossível ativar
// acidentalmente todos os guests". Se a flag global ligada continuasse
// bastando para abrir o pipeline para QUALQUER visitante anônimo, isso
// seria exatamente o vetor de ativação acidental em massa que a exigência
// proíbe — a flag global normalmente é ligada pensando no piloto de
// usuários autenticados (ex.: expandir a allowlist de userId, testar em
// homolog), e um humano configurando isso não necessariamente pretende
// abrir a porta para todo visitante não autenticado no mesmo instante.
// Guest agora é ligado EXCLUSIVAMENTE por dois caminhos, nunca pela flag
// global isolada:
//   1. Hash de sessão presente na allowlist de guest (abaixo).
//   2. Nenhum outro — não existe curinga, não existe "allowlist vazia
//      significa todos", não existe bypass por e-mail/telefone/nome (a
//      allowlist só aceita o hash técnico da sessão, calculado da mesma
//      forma que o resto do sistema já usa para correlacionar sessões
//      guest — hashGuestSessionToken() em cv-adaptation.service.ts).
// Por que é impossível ativar todos os guests por acidente: a allowlist
// default é uma string vazia -> Set vazio -> `has()` sempre falso para
// qualquer hash não explicitamente listado. Não há nenhum valor especial
// ("*", "all", etc.) tratado como curinga em parsePipelineAllowlistGuestSessionHashes
// — um `*` na env var viraria literalmente o hash "*", que nunca bate com
// um SHA-256 de 64 hex chars. Ligar geral exigiria listar, um por um, o
// guestSessionHash de cada sessão específica — o oposto de "acidental".
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
  // Hash SHA-256 de sessão (hashGuestSessionToken(), nunca dado de
  // identidade pessoal cru) — único mecanismo de ativação controlada de
  // guest nesta fase. Presente ou ausente, nunca decide nada sozinho: só
  // importa quando context.userId está ausente (guest de fato) E o hash
  // está na allowlist abaixo.
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

// Fase 3C, item 6 — mesmo padrão de parsePipelineAllowlistUserIds acima,
// isolado para o hash de sessão de guest. Nunca aceita curinga (ver
// comentário de cabeçalho): cada entrada é comparada por igualdade estrita
// de string contra o hash calculado pelo chamador.
export function parsePipelineAllowlistGuestSessionHashes(
  raw: string | undefined | null,
): ReadonlySet<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((hash) => hash.trim())
      .filter((hash) => hash.length > 0),
  );
}

export function isGuestSessionHashInPipelineAllowlist(
  guestSessionHash: string,
): boolean {
  const raw =
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES;
  return parsePipelineAllowlistGuestSessionHashes(raw).has(guestSessionHash);
}

@Injectable()
export class CvProcessingFlagResolverService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async isEnabledFor(
    context: CvStructuredProfilePipelineContext,
  ): Promise<boolean> {
    // Sem userId (guest, ou contexto que não resolveu um dono ainda):
    // Fase 3C, item 6 — a flag global NUNCA basta sozinha para guest (ver
    // cabeçalho do arquivo). O único jeito de ligar o pipeline novo para um
    // visitante é o hash da sessão estar explicitamente na allowlist de
    // guest — checado ANTES do master switch, deliberadamente, para que
    // nenhuma alteração futura desta função possa reintroduzir "flag
    // global liga geral" por acidente de ordem de checagem.
    if (!context.userId) {
      return (
        !!context.guestSessionHash &&
        isGuestSessionHashInPipelineAllowlist(context.guestSessionHash)
      );
    }

    // Master switch: continua valendo para todo usuário autenticado, como
    // antes — nada nesta fase muda o comportamento da flag global ligada
    // para o caminho de usuário logado.
    if (isCvStructuredProfilePipelineEnabled()) {
      return true;
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
