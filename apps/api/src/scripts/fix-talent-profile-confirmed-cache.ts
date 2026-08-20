// Correção pontual (não parte do pipeline normal) — restaura
// primaryEmail/phone/linkedinUrl de TalentProfile pro valor CONFIRMED_USER
// (declarado pela própria conta) sempre que o enriquecimento por IA já
// sobrescreveu esses campos com o que achou no texto do CV.
//
// Achado revisando "duplicatas" na Base de Talentos: dois profiles do
// mesmo nome (um cadastrado, um guest) mostravam o MESMO email no cache —
// mas o sinal real do cadastrado era outro (ex: conta
// "davidrtc13@gmail.com", CV lista "davidrtc14@gmail.com"). O cache
// mascarava a diferença real usada pra identidade, fazendo dois profiles
// de identidade genuinamente diferente parecerem duplicata óbvia. O fix
// em código (protectConfirmedCacheFields) impede isso daqui pra frente;
// este script corrige o que já foi gravado errado.
//
// Por padrão roda em --dry-run. Passe --apply pra gravar de verdade.
//
//   npm run talent:fix-confirmed-cache --workspace @earlycv/api
//   npm run talent:fix-confirmed-cache --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

const FIELD_BY_SIGNAL: Record<
  string,
  "primaryEmail" | "phone" | "linkedinUrl"
> = {
  EMAIL: "primaryEmail",
  PHONE: "phone",
  LINKEDIN: "linkedinUrl",
};

async function main() {
  const prisma = new PrismaClient();
  let checked = 0;
  let fixed = 0;

  console.log(
    `[fix-confirmed-cache] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"}`,
  );

  try {
    const signals = await prisma.talentIdentitySignal.findMany({
      where: {
        confidence: "CONFIRMED_USER",
        signalType: { in: ["EMAIL", "PHONE", "LINKEDIN"] },
      },
      select: {
        talentProfileId: true,
        signalType: true,
        normalizedValue: true,
      },
    });

    const byProfile = new Map<string, typeof signals>();
    for (const signal of signals) {
      const list = byProfile.get(signal.talentProfileId) ?? [];
      list.push(signal);
      byProfile.set(signal.talentProfileId, list);
    }

    for (const [talentProfileId, profileSignals] of byProfile) {
      checked += 1;
      const profile = await prisma.talentProfile.findUnique({
        where: { id: talentProfileId },
        select: { primaryEmail: true, phone: true, linkedinUrl: true },
      });
      if (!profile) continue;

      const patch: Record<string, string> = {};
      for (const signal of profileSignals) {
        const field = FIELD_BY_SIGNAL[signal.signalType];
        if (!field) continue;
        if (profile[field] !== signal.normalizedValue) {
          patch[field] = signal.normalizedValue;
        }
      }

      if (Object.keys(patch).length === 0) continue;

      fixed += 1;
      console.log(
        `[fix-confirmed-cache] ${talentProfileId}: ${JSON.stringify(patch)}`,
      );

      if (!DRY_RUN) {
        await prisma.talentProfile.update({
          where: { id: talentProfileId },
          data: patch,
        });
      }
    }

    console.log(
      `[fix-confirmed-cache] concluído: ${checked} profiles com sinal confirmado verificados, ${fixed} corrigidos`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[fix-confirmed-cache] fatal error", error);
  process.exitCode = 1;
});
