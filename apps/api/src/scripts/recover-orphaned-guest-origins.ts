// Recuperação pontual (não parte do pipeline normal) — fecha a lacuna que
// existia ANTES do TalentProfile.originSourceRecordId existir.
//
// Um guest cujo único texto extraível do CV era um cabeçalho de seção
// genérico ("Contato", "Resumo Profissional"...) virava um profile
// UNVERIFIED de qualquer forma (resolveForGuest cria o profile antes de
// tentar anexar o sinal), mas o sinal NAME_COMPOSITE em si nunca era
// gravado quando colidia com outro profile que já tinha aquele valor —
// então o profile ficava sem NENHUM vínculo de volta pro snapshot que o
// originou.
//
// Estratégia: acha os snapshots de guest que nenhum profile referencia
// (nem por TalentIdentitySignal, nem por originSourceRecordId), re-extrai
// o texto de cada um, e casa pelo fullName cacheado no profile órfão
// (mesmo valor, ignorando maiúscula/espaço) — se bater, grava o vínculo.
// Idempotente: só considera profiles ainda sem origin.
//
// Por padrão roda em --dry-run. Passe --apply pra gravar de verdade.
//
//   npm run talent:recover-orphaned-origins --workspace @earlycv/api
//   npm run talent:recover-orphaned-origins --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

import { StorageService } from "../storage/storage.service";
import { extractContactSignalsFromText } from "../talent-profiles/talent-identity.util";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Cabeçalho de seção comum em CV que o NAME_LINE_REGEX confunde com nome —
// casar por esses valores não identifica a pessoa (várias pessoas
// diferentes produzem o mesmo texto), então nunca usa pra parear
// recuperação automática, mesmo que "bata" com um profile órfão.
const GENERIC_HEADER_NAMES = new Set([
  "resumo",
  "resumo profissional",
  "perfil profissional",
  "formação",
  "formacao",
  "contato",
  "curriculo",
  "currículo",
  "objetivo",
  "experiencia profissional",
  "experiência profissional",
  "carreira",
  "sobre mim",
  "dados pessoais",
  "informações pessoais",
  "informacoes pessoais",
]);

async function main() {
  const prisma = new PrismaClient();
  const storage = new StorageService();

  try {
    const orphanProfiles = await prisma.talentProfile.findMany({
      where: {
        userId: null,
        originSourceRecordType: null,
        fullName: { not: null },
      },
      select: { id: true, fullName: true },
    });
    console.log(
      `[recover-origins] ${orphanProfiles.length} profiles órfãos (guest, sem origin, com nome cacheado)`,
    );

    const claimedSnapshotIds = new Set<string>([
      ...(
        await prisma.talentIdentitySignal.findMany({
          where: { sourceRecordType: "AnalysisCvSnapshot" },
          select: { sourceRecordId: true },
        })
      ).map((s) => s.sourceRecordId),
      ...(
        await prisma.talentProfile.findMany({
          where: { originSourceRecordType: "AnalysisCvSnapshot" },
          select: { originSourceRecordId: true },
        })
      )
        .map((p) => p.originSourceRecordId)
        .filter((id): id is string => id !== null),
    ]);

    const unclaimedSnapshots = await prisma.analysisCvSnapshot.findMany({
      where: { userId: null, id: { notIn: [...claimedSnapshotIds] } },
      select: { id: true, textStorageKey: true },
    });
    console.log(
      `[recover-origins] ${unclaimedSnapshots.length} snapshots de guest não reivindicados por nenhum profile`,
    );

    const byName = new Map<string, { id: string; fullName: string | null }>();
    for (const profile of orphanProfiles) {
      if (profile.fullName)
        byName.set(normalizeName(profile.fullName), profile);
    }

    let matched = 0;
    for (const snapshot of unclaimedSnapshots) {
      let text: string;
      try {
        text = (await storage.getObject(snapshot.textStorageKey)).toString(
          "utf8",
        );
      } catch {
        continue;
      }

      const extracted = extractContactSignalsFromText(text);
      if (!extracted.fullName) continue;

      const key = normalizeName(extracted.fullName);
      if (GENERIC_HEADER_NAMES.has(key)) continue;

      const orphan = byName.get(key);
      if (!orphan) continue;

      matched += 1;
      byName.delete(key);
      console.log(
        `[recover-origins] match: profile ${orphan.id} <- snapshot ${snapshot.id} (${extracted.fullName})`,
      );

      if (!DRY_RUN) {
        await prisma.talentProfile.update({
          where: { id: orphan.id },
          data: {
            originSourceRecordType: "AnalysisCvSnapshot",
            originSourceRecordId: snapshot.id,
          },
        });
      }
    }

    console.log(
      `[recover-origins] concluído: ${matched} recuperados, ${orphanProfiles.length - matched} continuam órfãos (modo: ${DRY_RUN ? "DRY-RUN" : "APPLY"})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[recover-origins] fatal error", error);
  process.exitCode = 1;
});
