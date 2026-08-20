// Protege campos de cache do TalentProfile que já vieram de um sinal
// CONFIRMED_USER (email/telefone/linkedin declarados pela própria conta)
// contra serem sobrescritos por um valor extraído por IA do texto do CV —
// achado revisando "duplicatas": o enriquecimento sobrescrevia
// incondicionalmente primaryEmail/phone/linkedinUrl com o que a IA achou
// no CV, mesmo quando o email da conta era diferente (ex: conta cadastrada
// com "davidrtc13@gmail.com", CV lista "davidrtc14@gmail.com" como
// contato) — o cache passava a mostrar o email do CV, fazendo dois
// profiles de pessoas diferentes (ou o mesmo profile visto duas vezes)
// parecerem ter o mesmo email quando o sinal real usado pra identidade
// nunca bateu.

import type { PrismaClient, TalentIdentitySignalType } from "@prisma/client";

type PrismaLike = Pick<PrismaClient, "talentIdentitySignal">;

const CACHE_FIELD_BY_SIGNAL: Record<
  "EMAIL" | "PHONE" | "LINKEDIN",
  "primaryEmail" | "phone" | "linkedinUrl"
> = {
  EMAIL: "primaryEmail",
  PHONE: "phone",
  LINKEDIN: "linkedinUrl",
};

export async function protectConfirmedCacheFields<
  T extends Partial<Record<"primaryEmail" | "phone" | "linkedinUrl", unknown>>,
>(prisma: PrismaLike, talentProfileId: string, patch: T): Promise<T> {
  const signalTypes = (
    Object.keys(CACHE_FIELD_BY_SIGNAL) as Array<
      keyof typeof CACHE_FIELD_BY_SIGNAL
    >
  ).filter((signalType) => CACHE_FIELD_BY_SIGNAL[signalType] in patch);
  if (signalTypes.length === 0) return patch;

  const confirmed = await prisma.talentIdentitySignal.findMany({
    where: {
      talentProfileId,
      confidence: "CONFIRMED_USER",
      signalType: { in: signalTypes as TalentIdentitySignalType[] },
    },
    select: { signalType: true },
  });

  const safePatch = { ...patch };
  for (const { signalType } of confirmed) {
    const field =
      CACHE_FIELD_BY_SIGNAL[signalType as "EMAIL" | "PHONE" | "LINKEDIN"];
    if (field) delete safePatch[field];
  }
  return safePatch;
}
