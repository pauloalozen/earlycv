// Testes permanentes — seção 3 da 2ª rodada da auditoria adversarial
// (2026-09-08). CV sintético completo (sem identidade, 3 experiências, 2
// formações na mesma instituição, skills repetidas, 2 tecnologias em
// experiences[].technologies, 2 idiomas, 2 certificações), fluxo real
// (guest allowlisted -> CvProcessingWorker -> CvTalentCaptureService).
// Compara canonicalJson x tabelas persistidas campo a campo, nunca só
// contagem total.
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";
process.env.SKIP_AI = "false";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import {
  buildAnalysisWorker,
  buildCapturingAiClient,
  buildCvText,
  buildEntrypoint,
  buildProcessingWorker,
  buildRealCvAdaptationService,
  database,
  JOB_DESCRIPTION_BASE,
  minimalAnalysisJson,
  minimalGenerationJson,
  prisma,
  processOneAnalysisJob,
  processOneCvJob,
  FakeStorage,
} from "./test-support/canonical-pipeline-test-services";
import { makeRunId } from "./test-support/canonical-pipeline-test-harness";

// Limpeza completa por IDs rastreados explicitamente (NÃO por conteúdo de
// texto — textStorageKey é "cv-processing/guests/<ownerId>/<sha256>.txt" e
// NUNCA contém o runId, então um filtro por `contains: runId` nessa coluna
// silenciosamente não encontra nada, dando um falso sinal de "limpo").
// CvSource cascade cobre CvSubmission/CvProcessingJob/CvStructuredProfile,
// mas TalentSubject/TalentProfile (e suas observações/TalentProfileSource,
// que cascadeiam de TalentProfile) NÃO cascadeiam a partir de CvSource (FK
// Restrict de propósito — ver schema.prisma), então precisam ser apagados
// explicitamente, na ordem certa (TalentProfile antes de TalentSubject,
// CvSource antes de TalentSubject por causa do Restrict). AnalysisJob
// também não tem FK direta pra CvSource — limpo por jobDescriptionText
// (esse campo, ao contrário de textStorageKey, de fato contém o runId).
async function cleanupTalentRun(
  runId: string,
  cvSourceId: string,
): Promise<void> {
  const source = await database.cvSource.findUnique({
    where: { id: cvSourceId },
    select: { talentSubjectId: true },
  });

  await database.analysisJob.deleteMany({
    where: { jobDescriptionText: { contains: runId } },
  });
  if (source?.talentSubjectId) {
    // Guest allowlisted é sempre o primeiro CV daquele TalentSubject
    // sintético (masterIntent default do endpoint), então normalmente
    // promove a Master — CvMasterDesignation.cvStructuredProfileId
    // referencia com FK sem cascade, bloqueando a exclusão do CvSource
    // até removê-la primeiro.
    await prisma.cvMasterDesignation.deleteMany({
      where: { talentSubjectId: source.talentSubjectId },
    });
    await prisma.talentProfile.deleteMany({
      where: { talentSubjectId: source.talentSubjectId },
    });
  }
  await database.cvSource.deleteMany({ where: { id: cvSourceId } });
  if (source?.talentSubjectId) {
    await prisma.talentSubject.deleteMany({
      where: { id: source.talentSubjectId },
    });
  }
}

// CV sintético completo, sem nome/e-mail/telefone — todos os campos de
// identidade explicitamente null.
function buildSyntheticCanonicalOutput(
  runId: string,
): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName: null,
      headline: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: `${runId} profissional com histórico diverso.`,
      experiences: [
        {
          role: `${runId} Analista de Dados`,
          company: `${runId} Empresa 1`,
          location: null,
          startDate: "2018-01",
          endDate: "2019-12",
          bullets: [`${runId} bullet 1a`, `${runId} bullet 1b`],
          technologies: [`${runId}-tech-sql`, `${runId}-tech-python`],
        },
        {
          role: `${runId} Analista de Dados Pleno`,
          company: `${runId} Empresa 2`,
          location: null,
          startDate: "2020-01",
          endDate: "2021-12",
          bullets: [`${runId} bullet 2a`],
          technologies: [`${runId}-tech-python`],
        },
        {
          role: `${runId} Analista de Dados Sênior`,
          company: `${runId} Empresa 3`,
          location: null,
          startDate: "2022-01",
          endDate: null,
          bullets: [`${runId} bullet 3a`],
          technologies: [],
        },
      ],
      education: [
        {
          institution: `${runId} Universidade Central`,
          degree: "Bacharelado",
          fieldOfStudy: "Estatística",
          startDate: "2013",
          endDate: "2017",
        },
        {
          institution: `${runId} Universidade Central`,
          degree: "Pós-graduação",
          fieldOfStudy: "Ciência de Dados",
          startDate: "2018",
          endDate: "2019",
        },
      ],
      // Skill repetida DELIBERADAMENTE (mesma string em duas posições) — a
      // chave de observação inclui itemIndex, então as duas precisam
      // sobreviver como observações distintas, nunca colapsar numa só.
      skills: [
        `${runId}-skill-sql`,
        `${runId}-skill-python`,
        `${runId}-skill-sql`,
      ],
      languages: [
        { language: `${runId} Português`, level: "Nativo" },
        { language: `${runId} Inglês`, level: "Avançado" },
      ],
      certifications: [
        { name: `${runId} Cert A`, issuer: "Instituto X", year: "2020" },
        { name: `${runId} Cert B`, issuer: "Instituto Y", year: "2021" },
      ],
    },
    extractionCoverage: {
      identifiedFields: [],
      missingFields: [],
      fieldStatus: {},
    },
    confidence: {},
    evidence: {},
  };
}

async function runGuestAllowlistedAnalysis(
  runId: string,
  outputBuilder: (runId: string) => MasterCvCanonicalExtractionOutput = buildSyntheticCanonicalOutput,
) {
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => outputBuilder(runId),
    storage,
  );
  const entrypoint = buildEntrypoint(storage);
  const { client } = buildCapturingAiClient(
    minimalAnalysisJson,
    minimalGenerationJson,
  );
  const service = buildRealCvAdaptationService(client, client, entrypoint);
  const analysisWorker = buildAnalysisWorker(service);

  const sessionPublicToken = `${runId}-session-${randomUUID()}`;
  const guestSessionHash = createHash("sha256")
    .update(sessionPublicToken)
    .digest("hex");
  const previousAllowlist =
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES;
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES =
    guestSessionHash;
  try {
    const started = await service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runId}`,
      undefined,
      `${runId} ${buildSyntheticCanonicalOutput(runId).canonicalProfile.professionalSummary}\nExperiência\n${runId} texto suficiente pra passar na validação de tamanho mínimo do endpoint, com múltiplas linhas de conteúdo relevante sobre a carreira do candidato.`,
      undefined,
      { sessionPublicToken } as never,
    );
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    if (!row.cvProcessingJobId) {
      throw new Error(
        "guest allowlisted deveria ter entrado no pipeline novo",
      );
    }
    const cvJobRow = await processOneCvJob(
      cvWorker,
      row.cvProcessingJobId,
    );
    await processOneAnalysisJob(analysisWorker, started.jobId);
    return { cvJobRow, service, analysisWorker, cvWorker, entrypoint };
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES =
      previousAllowlist;
  }
}

test("TALENTO 1: guest sem identidade — TalentSubject e TalentProfile corretos (talentSubjectId preenchido, userId null)", async () => {
  const runId = makeRunId("talento-1");
  let cvSourceId: string | undefined;
  try {
    const { cvJobRow } = await runGuestAllowlistedAnalysis(runId);
    cvSourceId = cvJobRow.cvSourceId;
    const cvSource = await database.cvSource.findUniqueOrThrow({
      where: { id: cvJobRow.cvSourceId },
    });
    assert.equal(cvSource.ownerType, "GUEST");
    assert.ok(cvSource.talentSubjectId);

    const talentProfile = await prisma.talentProfile.findUniqueOrThrow({
      where: { talentSubjectId: cvSource.talentSubjectId as string },
    });
    assert.equal(talentProfile.userId, null);
    assert.equal(
      talentProfile.fullName,
      null,
      "sem nome no CV — TalentProfile.fullName precisa continuar null, nunca inventado",
    );

    const source = await prisma.talentProfileSource.findUniqueOrThrow({
      where: {
        talentProfileId_cvSourceId: {
          talentProfileId: talentProfile.id,
          cvSourceId: cvSource.id,
        },
      },
    });
    assert.ok(source);
  } finally {
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

test("TALENTO 2: formações — DUAS observações sobrevivem mesmo com a mesma instituição (itemIndex distingue)", async () => {
  const runId = makeRunId("talento-2");
  let cvSourceId: string | undefined;
  try {
    const { cvJobRow } = await runGuestAllowlistedAnalysis(runId);
    cvSourceId = cvJobRow.cvSourceId;
    const observations = await prisma.talentEducationObservation.findMany({
      where: { cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string },
      orderBy: { itemIndex: "asc" },
    });
    assert.equal(observations.length, 2, "as duas formações precisam sobreviver, mesmo com institutionRaw idêntico");
    assert.equal(observations[0].institutionRaw, `${runId} Universidade Central`);
    assert.equal(observations[1].institutionRaw, `${runId} Universidade Central`);
    assert.equal(observations[0].degreeRaw, "Bacharelado");
    assert.equal(observations[1].degreeRaw, "Pós-graduação");
    assert.equal(observations[0].itemIndex, 0);
    assert.equal(observations[1].itemIndex, 1);
  } finally {
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

test("TALENTO 3: skills repetidas no MESMO CV — duas observações distintas (fingerprint igual, itemIndex diferente), nenhuma perda de proveniência", async () => {
  const runId = makeRunId("talento-3");
  let cvSourceId: string | undefined;
  try {
    const { cvJobRow } = await runGuestAllowlistedAnalysis(runId);
    cvSourceId = cvJobRow.cvSourceId;
    const observations = await prisma.talentCompetencyObservation.findMany({
      where: { cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string },
      orderBy: { itemIndex: "asc" },
    });
    assert.equal(
      observations.length,
      3,
      "3 posições no array skills (sql, python, sql-repetida) precisam gerar 3 observações, nunca colapsar a repetida",
    );
    const sqlObservations = observations.filter(
      (o) => o.valueRaw === `${runId}-skill-sql`,
    );
    assert.equal(
      sqlObservations.length,
      2,
      "a skill repetida (mesmo valueRaw) precisa ter 2 observações, uma por posição no CV",
    );
    assert.notEqual(sqlObservations[0].itemIndex, sqlObservations[1].itemIndex);
  } finally {
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

test("TALENTO 4: idiomas e certificações — dois de cada, campos corretos", async () => {
  const runId = makeRunId("talento-4");
  let cvSourceId: string | undefined;
  try {
    const { cvJobRow } = await runGuestAllowlistedAnalysis(runId);
    cvSourceId = cvJobRow.cvSourceId;
    const languages = await prisma.talentLanguageObservation.findMany({
      where: { cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string },
      orderBy: { itemIndex: "asc" },
    });
    assert.equal(languages.length, 2);
    assert.equal(languages[0].languageRaw, `${runId} Português`);
    assert.equal(languages[0].proficiencyLevelRaw, "Nativo");
    assert.equal(languages[1].languageRaw, `${runId} Inglês`);
    assert.equal(languages[1].proficiencyLevelRaw, "Avançado");

    const certifications = await prisma.talentCertificationObservation.findMany(
      {
        where: {
          cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string,
        },
        orderBy: { itemIndex: "asc" },
      },
    );
    assert.equal(certifications.length, 2);
    assert.equal(certifications[0].nameRaw, `${runId} Cert A`);
    assert.equal(certifications[1].nameRaw, `${runId} Cert B`);
  } finally {
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

// CV sintético para o cenário de colisão exigido pela 3ª rodada de
// auditoria: 5 experiências, 4 delas compartilhando company="Empresa A" /
// role="Engenheiro" (duas passagens em períodos diferentes, uma coincidindo
// período mas com bullets/projeto diferentes, e uma com cargo diferente na
// mesma empresa), mais uma totalmente distinta.
function buildCollisionCanonicalOutput(
  runId: string,
): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName: null,
      headline: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: `${runId} profissional com múltiplas passagens na mesma empresa.`,
      experiences: [
        {
          role: "Engenheiro",
          company: `${runId} Empresa A`,
          location: null,
          startDate: "2018-01",
          endDate: "2020-01",
          bullets: [`${runId} projeto Alpha`],
          technologies: [`${runId}-tech-1`],
        },
        {
          role: "Engenheiro",
          company: `${runId} Empresa A`,
          location: null,
          startDate: "2022-01",
          endDate: "2024-01",
          bullets: [`${runId} projeto Beta`],
          technologies: [`${runId}-tech-2`],
        },
        {
          role: "Engenheiro",
          company: `${runId} Empresa A`,
          location: null,
          startDate: "2022-01",
          endDate: "2024-01",
          bullets: [`${runId} projeto Gama (mesmo período, projeto diferente)`],
          technologies: [`${runId}-tech-3`],
        },
        {
          role: "Gerente",
          company: `${runId} Empresa A`,
          location: null,
          startDate: "2020-06",
          endDate: "2021-12",
          bullets: [`${runId} projeto Delta (cargo intermediário)`],
          technologies: [],
        },
        {
          role: "Analista",
          company: `${runId} Empresa B`,
          location: null,
          startDate: "2024-02",
          endDate: null,
          bullets: [`${runId} projeto Epsilon`],
          technologies: [],
        },
      ],
      education: [],
      skills: [],
      languages: [],
      certifications: [],
    },
    extractionCoverage: { identifiedFields: [], missingFields: [], fieldStatus: {} },
    confidence: {},
    evidence: {},
  };
}

test("TALENTO 5-COLISAO (achado da 3ª rodada): empresa+cargo NÃO identifica unicamente uma experiência — prova quantas linhas sobrevivem hoje na visão consolidada legada vs. na fonte de fidelidade total", async () => {
  const runId = makeRunId("talento-5-colisao");
  let cvSourceId: string | undefined;
  try {
    const { cvJobRow } = await runGuestAllowlistedAnalysis(
      runId,
      buildCollisionCanonicalOutput,
    );
    cvSourceId = cvJobRow.cvSourceId;
    const cvStructuredProfileId = cvJobRow.cvStructuredProfileId as string;

    // Visão consolidada legada (TalentExperience): DOCUMENTADAMENTE lossy —
    // as 3 primeiras entradas (mesma empresa+cargo) colapsam numa única
    // linha (a última upsert vence), sobrevivendo só 3 das 5 (Engenheiro
    // colapsado, Gerente, Analista). Isto é um cache de conveniência, não a
    // fonte de verdade — ver captureExperienceObservations.
    const legacyRows = await prisma.talentExperience.findMany({
      where: { sourceRecordId: cvStructuredProfileId },
    });
    assert.equal(
      legacyRows.length,
      3,
      "documenta o comportamento ATUAL e aceito da visão consolidada legada: 3 das 5 experiências sobrevivem (empresa+cargo colide, cache é lossy por design)",
    );
    const engenheiroRow = legacyRows.find((r) => r.role === "Engenheiro");
    assert.ok(engenheiroRow);
    assert.equal(
      engenheiroRow?.bulletsJson && (engenheiroRow.bulletsJson as string[])[0],
      `${runId} projeto Gama (mesmo período, projeto diferente)`,
      "documenta que a ÚLTIMA das 3 colisões é a que sobrevive no cache — as outras duas (Alpha, Beta) são perdidas ali",
    );

    // Fonte de verdade de fidelidade total (TalentExperienceObservation):
    // as 5 experiências sobrevivem, cada uma com seus próprios bullets e
    // período — este é o requisito real (nenhuma experiência descartada).
    const observations = await prisma.talentExperienceObservation.findMany({
      where: { cvStructuredProfileId },
      orderBy: { itemIndex: "asc" },
    });
    assert.equal(observations.length, 5, "as 5 experiências precisam sobreviver na fonte de verdade — nenhuma descartada por colisão de empresa+cargo");
    assert.equal(observations[0].bulletsJson && (observations[0].bulletsJson as string[])[0], `${runId} projeto Alpha`);
    assert.equal(observations[1].bulletsJson && (observations[1].bulletsJson as string[])[0], `${runId} projeto Beta`);
    assert.equal(observations[2].bulletsJson && (observations[2].bulletsJson as string[])[0], `${runId} projeto Gama (mesmo período, projeto diferente)`);
    assert.equal(observations[2].periodRaw, observations[1].periodRaw, "item 2 e 3 têm o MESMO período — só os bullets diferem, ambos precisam sobreviver");
    assert.equal(observations[3].roleRaw, "Gerente");
    assert.equal(observations[4].companyRaw, `${runId} Empresa B`);
  } finally {
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

test("TALENTO 5 (corrigido nesta rodada): as 3 experiências do CV são persistidas campo a campo em TalentExperience", async () => {
  const runId = makeRunId("talento-5");
  let cvSourceId: string | undefined;
  try {
    const { cvJobRow } = await runGuestAllowlistedAnalysis(runId);
    cvSourceId = cvJobRow.cvSourceId;

    const experiences = await prisma.talentExperience.findMany({
      where: { sourceRecordId: cvJobRow.cvStructuredProfileId as string },
      orderBy: { startDate: "asc" },
    });
    assert.equal(experiences.length, 3, "as 3 experiências do CV precisam sobreviver, nenhuma descartada");

    assert.equal(experiences[0].company, `${runId} Empresa 1`);
    assert.equal(experiences[0].role, `${runId} Analista de Dados`);
    assert.equal(experiences[0].companyNormalized, `${runId} Empresa 1`.trim().toLowerCase());
    assert.equal(experiences[0].roleNormalized, `${runId} Analista de Dados`.trim().toLowerCase());
    assert.equal(experiences[0].startDate?.getUTCFullYear(), 2018);
    assert.equal(experiences[0].endDate?.getUTCFullYear(), 2019);
    assert.equal(experiences[0].isCurrent, false);
    assert.deepEqual(experiences[0].bulletsJson, [`${runId} bullet 1a`, `${runId} bullet 1b`]);
    assert.deepEqual(
      [...experiences[0].technologiesUsed].sort(),
      [`${runId}-tech-python`, `${runId}-tech-sql`].sort(),
    );
    assert.equal(experiences[0].sourceRecordType, "CvStructuredProfile");
    assert.equal(experiences[0].sourceRecordId, cvJobRow.cvStructuredProfileId);

    assert.equal(experiences[2].company, `${runId} Empresa 3`);
    assert.equal(experiences[2].endDate, null, "sem endDate reconhecível (null no CV) — nunca inventar uma data");
    assert.equal(experiences[2].technologiesUsed.length, 0);

    const companies = experiences.map((e) => e.company).sort();
    assert.deepEqual(companies, [
      `${runId} Empresa 1`,
      `${runId} Empresa 2`,
      `${runId} Empresa 3`,
    ].sort());

    // Fonte de verdade de fidelidade total, campo a campo, na mesma ordem
    // de itemIndex do array do CV.
    const observations = await prisma.talentExperienceObservation.findMany({
      where: { cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string },
      orderBy: { itemIndex: "asc" },
    });
    assert.equal(observations.length, 3);
    assert.equal(observations[0].companyRaw, `${runId} Empresa 1`);
    assert.equal(observations[0].roleRaw, `${runId} Analista de Dados`);
    assert.equal(observations[0].periodRaw, "2018-01 - 2019-12");
    assert.deepEqual(observations[0].bulletsJson, [`${runId} bullet 1a`, `${runId} bullet 1b`]);
    assert.equal(observations[2].companyRaw, `${runId} Empresa 3`);
    assert.equal(observations[2].periodRaw, "2022-01 - ");
  } finally {
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

test("TALENTO 5b: retry (capture chamado de novo com o mesmo CvStructuredProfile) não duplica nem perde experiências", async () => {
  const runId = makeRunId("talento-5b");
  let cvSourceId: string | undefined;
  try {
    const { cvJobRow, cvWorker } = await runGuestAllowlistedAnalysis(runId);
    cvSourceId = cvJobRow.cvSourceId;
    const before = await prisma.talentExperience.count({
      where: { sourceRecordId: cvJobRow.cvStructuredProfileId as string },
    });
    assert.equal(before, 3);

    const cvSource = await database.cvSource.findUniqueOrThrow({ where: { id: cvSourceId } });
    const structuredProfile = await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: cvJobRow.cvStructuredProfileId as string },
    });
    await (
      cvWorker as unknown as {
        talentCapture: { capture: (input: unknown) => Promise<unknown> };
      }
    )["talentCapture"].capture({
      owner: { ownerType: "GUEST", talentSubjectId: cvSource.talentSubjectId },
      cvSourceId: cvSource.id,
      cvStructuredProfileId: structuredProfile.id,
      canonicalProfile: structuredProfile.canonicalJson,
    });

    const after = await prisma.talentExperience.count({
      where: { sourceRecordId: cvJobRow.cvStructuredProfileId as string },
    });
    assert.equal(after, 3, "retry não pode duplicar nem perder experiências");

    const observationsAfter = await prisma.talentExperienceObservation.count({
      where: { cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string },
    });
    assert.equal(observationsAfter, 3, "retry não pode duplicar nem perder observações de experiência");
  } finally {
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

test("TALENTO 5c: mesma experiência (empresa+cargo) em DOIS CVs do mesmo sujeito preserva DUAS proveniências (sourceRecordId distinto)", async () => {
  const runIdA = makeRunId("talento-5c-a");
  const runIdB = makeRunId("talento-5c-b");
  const sharedCompany = `Empresa Compartilhada ${randomUUID()}`;
  const sharedRole = `Cargo Compartilhado ${randomUUID()}`;

  function withSharedExperience(output: MasterCvCanonicalExtractionOutput) {
    return {
      ...output,
      canonicalProfile: {
        ...output.canonicalProfile,
        experiences: [
          {
            role: sharedRole,
            company: sharedCompany,
            location: null,
            startDate: "2019-01",
            endDate: "2020-01",
            bullets: [],
            technologies: [],
          },
        ],
      },
    };
  }

  const session = `${runIdA}-shared-session`;
  let cvSourceIdA: string | undefined;
  let cvSourceIdB: string | undefined;
  try {
    const storage = new FakeStorage();
    const cvWorkerA = buildProcessingWorker(
      async () => withSharedExperience(buildSyntheticCanonicalOutput(runIdA)),
      storage,
    );
    const cvWorkerB = buildProcessingWorker(
      async () => withSharedExperience(buildSyntheticCanonicalOutput(runIdB)),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const hash = createHash("sha256").update(session).digest("hex");
    const previousAllowlist =
      process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES;
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES = hash;
    try {
      const jobA = await service.startGuestAnalysisJob(
        `${JOB_DESCRIPTION_BASE} ${runIdA}`,
        undefined,
        `${runIdA} texto suficiente\nExperiência\n${runIdA} múltiplas linhas relevantes v1.`,
        undefined,
        { sessionPublicToken: session } as never,
      );
      const rowA = await database.analysisJob.findUniqueOrThrow({ where: { id: jobA.jobId } });
      const cvJobA = await processOneCvJob(cvWorkerA, rowA.cvProcessingJobId as string);
      cvSourceIdA = cvJobA.cvSourceId;
      await processOneAnalysisJob(analysisWorker, jobA.jobId);

      const jobB = await service.startGuestAnalysisJob(
        `${JOB_DESCRIPTION_BASE} ${runIdB}`,
        undefined,
        `${runIdB} texto suficiente\nExperiência\n${runIdB} múltiplas linhas relevantes v2-diferente-o-bastante.`,
        undefined,
        { sessionPublicToken: session } as never,
      );
      const rowB = await database.analysisJob.findUniqueOrThrow({ where: { id: jobB.jobId } });
      const cvJobB = await processOneCvJob(cvWorkerB, rowB.cvProcessingJobId as string);
      cvSourceIdB = cvJobB.cvSourceId;
      await processOneAnalysisJob(analysisWorker, jobB.jobId);

      const rows = await prisma.talentExperience.findMany({
        where: { companyNormalized: sharedCompany.toLowerCase() },
      });
      assert.equal(rows.length, 2, "a mesma experiência em 2 CVs precisa gerar 2 linhas, uma por documento");
      assert.notEqual(rows[0].sourceRecordId, rows[1].sourceRecordId);
      assert.equal(rows[0].talentProfileId, rows[1].talentProfileId, "mesmo sujeito/sessão — mesmo TalentProfile");

      const observations = await prisma.talentExperienceObservation.findMany({
        where: { companyRaw: sharedCompany },
      });
      assert.equal(observations.length, 2, "a fonte de fidelidade total também preserva 2 observações separadas, uma por CvStructuredProfile");
      assert.notEqual(observations[0].cvStructuredProfileId, observations[1].cvStructuredProfileId);
      assert.equal(observations[0].talentProfileId, observations[1].talentProfileId);
    } finally {
      process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES =
        previousAllowlist;
    }
  } finally {
    if (cvSourceIdB) {
      await database.analysisJob.deleteMany({
        where: { jobDescriptionText: { contains: runIdB } },
      });
      await database.cvSource.deleteMany({ where: { id: cvSourceIdB } });
    }
    if (cvSourceIdA) await cleanupTalentRun(runIdA, cvSourceIdA);
  }
});

test("TALENTO 5d: currentTitle vem de headline; CV avulso (não-Master) só preenche se vazio, nunca sobrescreve um valor já confirmado pelo Master", async () => {
  const runId = makeRunId("talento-5d");
  let cvSourceId: string | undefined;
  let cvSourceId2: string | undefined;
  try {
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const session = `${runId}-session`;
    const hash = createHash("sha256").update(session).digest("hex");
    const previousAllowlist =
      process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES;
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES = hash;
    try {
      // CV 1: primeiro do guest — vira Master automaticamente
      // (masterIntent default) — headline dele DEVE virar currentTitle.
      const cvWorker1 = buildProcessingWorker(async () => ({
        ...buildSyntheticCanonicalOutput(`${runId}-1`),
        canonicalProfile: {
          ...buildSyntheticCanonicalOutput(`${runId}-1`).canonicalProfile,
          headline: `${runId} Cargo Atual Master`,
        },
      }), storage);
      const job1 = await service.startGuestAnalysisJob(
        `${JOB_DESCRIPTION_BASE} ${runId}-1`,
        undefined,
        `${runId} texto suficiente\nExperiência\n${runId} múltiplas linhas relevantes v1.`,
        undefined,
        { sessionPublicToken: session } as never,
      );
      const row1 = await database.analysisJob.findUniqueOrThrow({ where: { id: job1.jobId } });
      const cvJob1 = await processOneCvJob(cvWorker1, row1.cvProcessingJobId as string);
      cvSourceId = cvJob1.cvSourceId;
      await processOneAnalysisJob(analysisWorker, job1.jobId);

      const talentSubjectId = (
        await database.cvSource.findUniqueOrThrow({ where: { id: cvSourceId } })
      ).talentSubjectId as string;
      const profileAfterMaster = await prisma.talentProfile.findUniqueOrThrow({
        where: { talentSubjectId },
      });
      assert.equal(profileAfterMaster.currentTitle, `${runId} Cargo Atual Master`);

      // CV 2: segundo CV do MESMO guest, com masterIntent NONE (nunca vira
      // Master) — headline "antigo"/diferente NÃO pode sobrescrever o
      // currentTitle já confirmado pelo Master.
      const cvWorker2 = buildProcessingWorker(async () => ({
        ...buildSyntheticCanonicalOutput(`${runId}-2`),
        canonicalProfile: {
          ...buildSyntheticCanonicalOutput(`${runId}-2`).canonicalProfile,
          headline: `${runId} Cargo Historico Avulso`,
        },
      }), storage);
      const job2 = await service.startGuestAnalysisJob(
        `${JOB_DESCRIPTION_BASE} ${runId}-2`,
        undefined,
        `${runId} texto suficiente diferente\nExperiência\n${runId} múltiplas linhas relevantes v2-bem-diferente-do-primeiro.`,
        undefined,
        { sessionPublicToken: session } as never,
      );
      const row2 = await database.analysisJob.findUniqueOrThrow({ where: { id: job2.jobId } });
      const cvJob2 = await processOneCvJob(cvWorker2, row2.cvProcessingJobId as string);
      cvSourceId2 = cvJob2.cvSourceId;
      await processOneAnalysisJob(analysisWorker, job2.jobId);

      const profileAfterAvulso = await prisma.talentProfile.findUniqueOrThrow({
        where: { talentSubjectId },
      });
      assert.equal(
        profileAfterAvulso.currentTitle,
        `${runId} Cargo Atual Master`,
        "CV avulso não pode substituir silenciosamente o cargo atual confirmado pelo Master",
      );
    } finally {
      process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES =
        previousAllowlist;
    }
  } finally {
    if (cvSourceId2) {
      await database.analysisJob.deleteMany({
        where: { jobDescriptionText: { contains: `${runId}-2` } },
      });
      await database.cvSource.deleteMany({ where: { id: cvSourceId2 } });
    }
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

test("TALENTO 6: retry (reprocessar o mesmo CvProcessingJob) não duplica observações — fingerprint idempotente", async () => {
  const runId = makeRunId("talento-6");
  let cvSourceId: string | undefined;
  try {
    const { cvJobRow, cvWorker } = await runGuestAllowlistedAnalysis(runId);
    cvSourceId = cvJobRow.cvSourceId;
    const before = await prisma.talentCompetencyObservation.count({
      where: { cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string },
    });

    // Chama capture() de novo diretamente com o MESMO input (simula um
    // retry do worker que já tinha persistido a extração) — upsert deve
    // ser no-op.
    const cvSource = await database.cvSource.findUniqueOrThrow({
      where: { id: cvJobRow.cvSourceId },
    });
    const structuredProfile = await database.cvStructuredProfile.findUniqueOrThrow(
      { where: { id: cvJobRow.cvStructuredProfileId as string } },
    );
    await (
      cvWorker as unknown as {
        talentCapture: {
          capture: (input: unknown) => Promise<unknown>;
        };
      }
    )["talentCapture"].capture({
      owner: { ownerType: "GUEST", talentSubjectId: cvSource.talentSubjectId },
      cvSourceId: cvSource.id,
      cvStructuredProfileId: structuredProfile.id,
      canonicalProfile: structuredProfile.canonicalJson,
    });

    const after = await prisma.talentCompetencyObservation.count({
      where: { cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string },
    });
    assert.equal(after, before, "retry não pode duplicar observações de competência");
  } finally {
    if (cvSourceId) await cleanupTalentRun(runId, cvSourceId);
  }
});

test("TALENTO 7: mesma competência observada em DOIS CVs diferentes gera DUAS observações (proveniência por documento preservada)", async () => {
  const runIdA = makeRunId("talento-7a");
  const runIdB = makeRunId("talento-7b");
  const sharedSkill = `shared-skill-${randomUUID()}`;
  let cvSourceIdA: string | undefined;
  let cvSourceIdB: string | undefined;

  function withSharedSkill(output: MasterCvCanonicalExtractionOutput) {
    return {
      ...output,
      canonicalProfile: {
        ...output.canonicalProfile,
        skills: [sharedSkill],
      },
    };
  }

  try {
    const storage = new FakeStorage();
    const cvWorkerA = buildProcessingWorker(
      async () => withSharedSkill(buildSyntheticCanonicalOutput(runIdA)),
      storage,
    );
    const cvWorkerB = buildProcessingWorker(
      async () => withSharedSkill(buildSyntheticCanonicalOutput(runIdB)),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const sessionA = `${runIdA}-session-${randomUUID()}`;
    const hashA = createHash("sha256").update(sessionA).digest("hex");
    const sessionB = `${runIdB}-session-${randomUUID()}`;
    const hashB = createHash("sha256").update(sessionB).digest("hex");
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES = `${hashA},${hashB}`;

    const jobA = await service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runIdA}`,
      undefined,
      buildCvText(runIdA, sharedSkill),
      undefined,
      { sessionPublicToken: sessionA } as never,
    );
    const rowA = await database.analysisJob.findUniqueOrThrow({
      where: { id: jobA.jobId },
    });
    const cvJobA = await processOneCvJob(
      cvWorkerA,
      rowA.cvProcessingJobId as string,
    );
    cvSourceIdA = cvJobA.cvSourceId;
    await processOneAnalysisJob(analysisWorker, jobA.jobId);

    const jobB = await service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runIdB}`,
      undefined,
      buildCvText(runIdB, sharedSkill),
      undefined,
      { sessionPublicToken: sessionB } as never,
    );
    const rowB = await database.analysisJob.findUniqueOrThrow({
      where: { id: jobB.jobId },
    });
    const cvJobB = await processOneCvJob(
      cvWorkerB,
      rowB.cvProcessingJobId as string,
    );
    cvSourceIdB = cvJobB.cvSourceId;
    await processOneAnalysisJob(analysisWorker, jobB.jobId);

    const observations = await prisma.talentCompetencyObservation.findMany({
      where: { valueRaw: sharedSkill },
    });
    assert.equal(
      observations.length,
      2,
      "mesma skill em dois TalentSubject/CV diferentes precisa gerar 2 observações — nunca fundir proveniência",
    );
    assert.notEqual(
      observations[0].cvStructuredProfileId,
      observations[1].cvStructuredProfileId,
    );
    assert.notEqual(cvJobA.cvSourceId, cvJobB.cvSourceId);
  } finally {
    if (cvSourceIdA) await cleanupTalentRun(runIdA, cvSourceIdA);
    if (cvSourceIdB) await cleanupTalentRun(runIdB, cvSourceIdB);
  }
});
