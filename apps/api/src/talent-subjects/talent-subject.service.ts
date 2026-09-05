// Resolução de sujeito anônimo (TalentSubject) a partir de uma sessão de
// visitante — plano, docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
// seção 3, escopo Fase 2D. A sessão (guestSessionHash) é só um SINAL de
// localização, nunca a identidade em si: TalentSubjectSessionSignal aponta
// pro TalentSubject real, e várias sessões podem apontar pro mesmo sujeito.
//
// Escopo desta fase (decisão documentada — ver README abaixo e o relatório
// final da Fase 2D): resolução de identidade CROSS-SESSÃO (duas sessões
// diferentes, sinal forte tipo e-mail declarado batendo, fundidas no mesmo
// TalentSubject) fica FORA DO ESCOPO desta sub-fase. Motivo: o
// CvSource.talentSubjectId precisa existir no momento do entrypoint —
// ANTES de qualquer extração de IA rodar — mas o sinal de identidade
// (e-mail/telefone/nome) só existe DEPOIS da extração (dentro de
// CvStructuredProfile.canonicalJson). Ligar sessões diferentes ao mesmo
// sujeito depois da extração exigiria re-parentar CvSource já criados sob
// um TalentSubject "provisório" — o plano (seção 3) trata isso como merge
// auditado (TalentSubjectMergeEvent), com a mesma mecânica do claim
// (Fase 2E, ainda não implementada). Implementar esse merge aqui duplicaria
// parte da lógica de claim antes dela existir — fica para 2E/2F, quando
// TalentSubjectMergeEvent ganha um escritor real.
//
// O que ESTA fase garante (e testa): a mesma sessão sempre resolve pro
// mesmo TalentSubject (via TalentSubjectSessionSignal.guestSessionHash,
// @unique), e todo TalentSubject novo eventualmente ganha um TalentProfile
// completo (garantido por CvTalentCaptureService#findOrCreateTalentProfile,
// chamado sempre que uma extração chega a READY — mesmo sem nenhum sinal de
// identidade extraído).
import { Inject, Injectable } from "@nestjs/common";
import type { TalentSubject } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export type ResolveGuestSubjectResult = {
  talentSubjectId: string;
  created: boolean;
};

@Injectable()
export class TalentSubjectService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // Ponto único de resolução do dono GUEST usado pelo entrypoint (Fase 2D)
  // antes de criar/reusar um CvSource. Idempotente por construção: chamar
  // duas vezes com o mesmo guestSessionHash sempre devolve o mesmo
  // talentSubjectId, mesmo sob concorrência real (duas requisições da
  // mesma sessão em voo simultaneamente) — mesmo padrão de
  // create()+catch(P2002)+reread já usado em
  // cv-processing-entrypoint.service.ts#createSourceOrReuse e
  // cv-talent-capture.service.ts#findOrCreateTalentProfile.
  async resolveForGuestSession(
    guestSessionHash: string,
  ): Promise<ResolveGuestSubjectResult> {
    const existingSignal =
      await this.database.talentSubjectSessionSignal.findUnique({
        where: { guestSessionHash },
      });

    if (existingSignal) {
      await this.database.talentSubjectSessionSignal.update({
        where: { id: existingSignal.id },
        data: { lastSeenAt: new Date() },
      });
      return {
        talentSubjectId: existingSignal.talentSubjectId,
        created: false,
      };
    }

    // Nenhum sinal de sessão prévio — cria um TalentSubject novo. Ver
    // comentário de topo: resolução de identidade cross-sessão fica fora
    // do escopo desta fase.
    const subject: TalentSubject = await this.database.talentSubject.create({
      data: {},
    });

    try {
      await this.database.talentSubjectSessionSignal.create({
        data: { talentSubjectId: subject.id, guestSessionHash },
      });
      return { talentSubjectId: subject.id, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // Perdeu a corrida do @unique(guestSessionHash) — outra requisição
      // concorrente da MESMA sessão já criou o sinal primeiro. O
      // TalentSubject que este processo acabou de criar fica órfão (nunca
      // referenciado por nenhum CvSource ainda, nenhum efeito colateral
      // observável) — relê o sinal vencedor e usa o TalentSubject dele.
      const winner =
        await this.database.talentSubjectSessionSignal.findUniqueOrThrow({
          where: { guestSessionHash },
        });
      return { talentSubjectId: winner.talentSubjectId, created: false };
    }
  }
}
