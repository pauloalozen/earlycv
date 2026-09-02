import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { CvAdaptationService } from "./cv-adaptation.service";

const CvAdaptationServiceCtor = CvAdaptationService as unknown as new (
  ...args: unknown[]
) => CvAdaptationService;

const makeFile = (buffer: Buffer) => ({
  buffer,
  encoding: "7bit",
  fieldname: "file",
  mimetype: "application/pdf",
  originalname: "resume.pdf",
  size: buffer.length,
});

const makeAnalyzeDto = () => ({
  jobDescriptionText:
    "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
  masterResumeId: "resume-1",
  saveAsMaster: false,
  turnstileToken: "token",
});

const validMasterCvText =
  "Resumo profissional com foco em analise de dados e produto digital para tomada de decisao.\nExperiencia\n2022 - 2025\nSQL, Python e dashboards";

test("analyzeAuthenticated delegates protected execution through gateway boundary", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => ({ rawText: "CV base" }),
      },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("analyzeAndAdaptDirect should not be called directly");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
    },
  );

  const result = await service.analyzeAuthenticated(
    "user-1",
    makeAnalyzeDto(),
    undefined,
    {
      correlationId: "corr",
      ip: "203.0.113.10",
      requestId: "req",
      sessionInternalId: null,
      sessionPublicToken: null,
      userId: "user-1",
    },
  );

  assert.equal(result.previewText, "preview");
  assert.equal(result.masterCvText, "CV base");
});

test("analyzeGuest payload uses deterministic file fingerprint for dedupe", async () => {
  const capturedPayloads: Array<Record<string, unknown>> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async ({
        payload,
      }: {
        payload: Record<string, unknown>;
      }) => {
        capturedPayloads.push(payload);
        return {
          message: "blocked",
          ok: false,
          reason: "turnstile_invalid",
        };
      },
    },
  );

  await assert.rejects(
    service.analyzeGuest(
      "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
      makeFile(Buffer.from("resume-a")),
      undefined,
      "token",
    ),
  );
  await assert.rejects(
    service.analyzeGuest(
      "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
      makeFile(Buffer.from("resume-b")),
      undefined,
      "token",
    ),
  );

  assert.equal(capturedPayloads.length, 2);
  const firstFingerprint = capturedPayloads[0]?.cvFingerprint;
  const secondFingerprint = capturedPayloads[1]?.cvFingerprint;

  assert.equal(
    firstFingerprint,
    createHash("sha256").update(Buffer.from("resume-a")).digest("hex"),
  );
  assert.equal(
    secondFingerprint,
    createHash("sha256").update(Buffer.from("resume-b")).digest("hex"),
  );
  assert.notEqual(firstFingerprint, secondFingerprint);
});

test("analyzeGuest accepts CV text without file", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV texto",
          previewText: "preview",
        },
      }),
    },
  );

  const result = await service.analyzeGuest(
    "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    undefined,
    validMasterCvText,
    "token",
  );

  assert.equal(result.masterCvText, "CV texto");
});

test("analyzeGuest persists the first requirement rule for a requirementSourceHash", async () => {
  const protectedCalls: Array<Record<string, unknown>> = [];
  const createdRules: Array<Record<string, unknown>> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async (input: Record<string, unknown>) => {
        protectedCalls.push(input);
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: { ok: true },
            previewText: "preview",
            masterCvText: "CV texto",
            analysisModel: "gpt-test",
            analysisPromptVersion: "2026-06-09.v1",
            structuredRequirements: [
              {
                requirementKey: "sql-analytics",
                requirementText: "Experiencia com SQL para analise de dados",
                importance: "high",
              },
            ],
          },
        };
      },
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      getOrCreateCanonicalJob: async () => ({
        canonicalJobId: "canonical-1",
        rawJobHash: "raw-hash",
        canonicalJobHash: "canonical-hash",
        requirementSourceHash: "req-source-1",
        canonicalJobJson: { title: "Analista de Dados" },
        reusedByRawHash: false,
        reusedByCanonicalHash: false,
      }),
    },
    {
      findByRequirementSourceHash: async () => null,
      getOrCreateFromAnalysis: async (input: Record<string, unknown>) => {
        createdRules.push(input);
        return {
          id: "rule-1",
          requirementSourceHash: "req-source-1",
          canonicalJobId: "canonical-1",
          requirements: input.requirements,
          analysisModel: "gpt-test",
          analysisPromptVersion: "2026-06-09.v1",
        };
      },
    },
  );

  await service.analyzeGuest(
    "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    undefined,
    validMasterCvText,
    "token",
  );

  assert.equal(createdRules.length, 1);
  assert.deepEqual(createdRules[0]?.requirements, [
    {
      requirementKey: "sql-analytics",
      requirementText: "Experiencia com SQL para analise de dados",
      importance: "high",
    },
  ]);
  assert.deepEqual(protectedCalls[0]?.existingRequirements, undefined);
});

test("analyzeGuest reuses an existing requirement rule without recreating it", async () => {
  const protectedCalls: Array<Record<string, unknown>> = [];
  let createCalls = 0;

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
      cvAdaptation: { findFirst: async () => null },
    },
    {
      analyzeAndAdapt: async () => {},
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async (input: Record<string, unknown>) => {
        protectedCalls.push(input);
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: { ok: true },
            previewText: "preview",
            masterCvText: "CV texto",
            analysisModel: "gpt-test",
            analysisPromptVersion: "2026-06-09.v1",
            structuredRequirements: [
              {
                requirementKey: "sql-analytics",
                requirementText: "Experiencia com SQL para analise de dados",
                importance: "high",
              },
            ],
          },
        };
      },
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      getOrCreateCanonicalJob: async () => ({
        canonicalJobId: "canonical-1",
        rawJobHash: "raw-hash",
        canonicalJobHash: "canonical-hash",
        requirementSourceHash: "req-source-1",
        canonicalJobJson: { title: "Analista de Dados" },
        reusedByRawHash: true,
        reusedByCanonicalHash: true,
      }),
    },
    {
      findByRequirementSourceHash: async () => ({
        id: "rule-1",
        requirementSourceHash: "req-source-1",
        canonicalJobId: "canonical-1",
        requirements: [
          {
            requirementKey: "sql-analytics",
            requirementText: "Experiencia com SQL para analise de dados",
            importance: "high",
          },
        ],
        analysisModel: "gpt-old",
        analysisPromptVersion: "2026-06-08.v1",
      }),
      getOrCreateFromAnalysis: async () => {
        createCalls += 1;
        throw new Error("should not create");
      },
    },
  );

  await service.analyzeGuest(
    "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    undefined,
    validMasterCvText,
    "token",
  );

  assert.equal(createCalls, 0);
  assert.deepEqual(protectedCalls[0]?.existingRequirements, [
    {
      requirementKey: "sql-analytics",
      requirementText: "Experiencia com SQL para analise de dados",
      importance: "high",
    },
  ]);
});

test("analyzeAuthenticated with adapted CV reuses existing requirement set without recreating", async () => {
  const protectedCalls: Array<Record<string, unknown>> = [];
  let createRuleCalls = 0;

  const existingRequirements = [
    {
      requirementKey: "sql-analytics",
      requirementText: "Experiencia com SQL para analise de dados",
      importance: "high",
    },
  ];

  const service = new CvAdaptationServiceCtor(
    {
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-adapted-cv-1" }),
      },
      cvAdaptation: { findFirst: async () => null, findMany: async () => [] },
    },
    {
      analyzeAndAdapt: async () => {},
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async (input: Record<string, unknown>) => {
        protectedCalls.push(input);
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: { ok: true },
            previewText: "preview-adaptado",
            masterCvText: "CV adaptado texto",
            analysisModel: "gpt-test",
            analysisPromptVersion: "2026-06-09.v1",
            structuredRequirements: existingRequirements,
          },
        };
      },
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      getOrCreateCanonicalJob: async () => ({
        canonicalJobId: "canonical-vaga-a",
        rawJobHash: "raw-hash-a",
        canonicalJobHash: "canonical-hash-a",
        requirementSourceHash: "req-source-a",
        canonicalJobJson: { title: "Analista de Dados" },
        reusedByRawHash: true,
        reusedByCanonicalHash: true,
      }),
    },
    {
      findByRequirementSourceHash: async () => ({
        id: "rule-existente-1",
        requirementSourceHash: "req-source-a",
        canonicalJobId: "canonical-vaga-a",
        requirements: existingRequirements,
        analysisModel: "gpt-antigo",
        analysisPromptVersion: "2026-06-08.v1",
      }),
      getOrCreateFromAnalysis: async () => {
        createRuleCalls += 1;
        throw new Error("should not create a new rule when reusing adapted CV");
      },
    },
  );

  const result = await service.analyzeAuthenticated("user-1", {
    jobDescriptionText:
      "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    masterCvText: validMasterCvText,
    saveAsMaster: false,
    turnstileToken: "token",
  });

  assert.equal(
    createRuleCalls,
    0,
    "must not create a new requirement set when one already exists",
  );
  assert.equal(protectedCalls.length, 1);
  assert.deepEqual(
    protectedCalls[0]?.existingRequirements,
    existingRequirements,
    "must pass existing requirements to AI so it uses the same rule",
  );
  assert.equal(result.previewText, "preview-adaptado");
});

test("analyzeAuthenticated creates separate requirement sets for two different vagas", async () => {
  const createdRules: Array<{ requirementSourceHash: string }> = [];

  let callCount = 0;
  const requirementSourceHashes = ["req-source-vaga-a", "req-source-vaga-b"];
  const canonicalJobIds = ["canonical-vaga-a", "canonical-vaga-b"];

  const makeService = () =>
    new CvAdaptationServiceCtor(
      {
        analysisCvSnapshot: {
          create: async () => ({ id: `snapshot-${++callCount}` }),
        },
      },
      {
        analyzeAndAdapt: async () => {},
        buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
      },
      { createIntent: async () => ({}) },
      { generatePdf: async () => Buffer.from("pdf") },
      {
        generateDocx: async () => Buffer.from("docx"),
        toPdf: async () => Buffer.from("pdf"),
      },
      {
        executeProtectedAnalyze: async () => ({
          ok: true,
          cached: false,
          canonicalHash: "hash-x",
          result: {
            adaptedContentJson: { ok: true },
            previewText: "preview",
            masterCvText: "CV texto",
            analysisModel: "gpt-test",
            analysisPromptVersion: "2026-06-09.v1",
            structuredRequirements: [
              {
                requirementKey: "req-key",
                requirementText: "Requisito da vaga",
                importance: "high",
              },
            ],
          },
        }),
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        getOrCreateCanonicalJob: async () => {
          const idx = callCount - 1;
          return {
            canonicalJobId: canonicalJobIds[idx] ?? `canonical-${idx}`,
            rawJobHash: `raw-hash-${idx}`,
            canonicalJobHash: `canonical-hash-${idx}`,
            requirementSourceHash:
              requirementSourceHashes[idx] ?? `req-source-${idx}`,
            canonicalJobJson: { title: `Vaga ${idx}` },
            reusedByRawHash: false,
            reusedByCanonicalHash: false,
          };
        },
      },
      {
        findByRequirementSourceHash: async () => null,
        getOrCreateFromAnalysis: async (input: {
          requirementSourceHash: string;
        }) => {
          createdRules.push({
            requirementSourceHash: input.requirementSourceHash,
          });
          return {
            id: `rule-${createdRules.length}`,
            requirementSourceHash: input.requirementSourceHash,
            canonicalJobId: "canonical-x",
            requirements: [],
            analysisModel: "gpt-test",
            analysisPromptVersion: "2026-06-09.v1",
          };
        },
      },
    );

  const service = makeService();

  await service.analyzeAuthenticated("user-1", {
    jobDescriptionText:
      "Descricao da vaga A com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    masterCvText: validMasterCvText,
    saveAsMaster: false,
    turnstileToken: "token",
  });

  await service.analyzeAuthenticated("user-1", {
    jobDescriptionText:
      "Descricao da vaga B com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    masterCvText: validMasterCvText,
    saveAsMaster: false,
    turnstileToken: "token",
  });

  assert.equal(
    createdRules.length,
    2,
    "must create a separate requirement set for each distinct vaga",
  );
  assert.notEqual(
    createdRules[0]?.requirementSourceHash,
    createdRules[1]?.requirementSourceHash,
    "the two requirement sets must have different requirementSourceHash values",
  );
});

test("analyzeGuest validates job description before CV text checks", async () => {
  let protectedCalls = 0;

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => {
        protectedCalls += 1;
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: {},
            previewText: "preview",
            masterCvText: "CV",
          },
        };
      },
    },
  );

  await assert.rejects(
    service.analyzeGuest("texto invalido", undefined, "curto", "token"),
    /não parece uma descrição de vaga/i,
  );

  assert.equal(protectedCalls, 0);
});

test("analyzeGuest prioritizes turnstile blocking before short CV validation", async () => {
  let protectedCalls = 0;

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => {
        protectedCalls += 1;
        return {
          message: "blocked",
          ok: false,
          reason: "turnstile_missing",
        };
      },
    },
  );

  await assert.rejects(
    service.analyzeGuest(
      "Descricao da vaga para analista com responsabilidades, requisitos, stack tecnica e colaboracao com produto e dados.",
      undefined,
      "cv curto",
      undefined,
    ),
    /turnstile/i,
  );

  assert.equal(protectedCalls, 1);
});

test("analyzeGuest prioritizes masterCvText and ignores uploaded file", async () => {
  let payloadHasFile = true;
  let payloadCvFingerprint: string | null | undefined;

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: { ok: true },
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async ({
        payload,
      }: {
        payload: { cvFingerprint?: string | null; hasFile?: boolean };
      }) => {
        payloadHasFile = Boolean(payload.hasFile);
        payloadCvFingerprint = payload.cvFingerprint;
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: { ok: true },
            previewText: "preview",
            masterCvText: "Resumo\nExperiencia\n2022\nSQL",
          },
        };
      },
    },
  );

  const result = await service.analyzeGuest(
    "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    {
      buffer: Buffer.from("legacy-doc"),
      encoding: "7bit",
      fieldname: "file",
      mimetype: "application/msword",
      originalname: "cv.doc",
      size: 10,
    },
    validMasterCvText,
    "token",
  );

  assert.equal(result.previewText, "preview");
  assert.equal(payloadHasFile, false);
  assert.equal(payloadCvFingerprint, null);
});

test("analyzeAuthenticated accepts masterCvText without file or masterResumeId", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => {
          throw new Error("resume lookup should not run");
        },
      },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-auth-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV texto",
          previewText: "preview",
        },
      }),
    },
  );

  const result = await service.analyzeAuthenticated("user-1", {
    jobDescriptionText:
      "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    masterCvText: validMasterCvText,
    saveAsMaster: false,
    turnstileToken: "token",
  });

  assert.equal(result.previewText, "preview");
});

test("analyzeAuthenticated with inputMode=profile builds masterCvText from UserProfile, never from Resume.rawText", async () => {
  let aiLoadedText = "";
  let resumeLookupCalled = false;

  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => {
          resumeLookupCalled = true;
          return {
            id: "resume-1",
            rawText: "Texto do arquivo, sem cidade nenhuma.",
          };
        },
      },
      userProfile: {
        findUnique: async () => ({
          fullName: "Maria Teste",
          phone: "+55 11 99999-0000",
          linkedinUrl: "https://linkedin.com/in/mariateste",
          city: "Santana de Parnaíba",
          state: "SP",
          country: "Brasil",
          headline: "Analista de Dados Sênior",
          professionalSummary:
            "Profissional de dados com foco em produto e negócio.",
          experiencesJson: [
            {
              id: "exp-1",
              company: "Empresa X",
              role: "Analista de Dados",
              startDate: "2022",
              isCurrent: true,
              description: "Responsável por dashboards e pipelines.",
              achievements: ["Reduziu tempo de relatório em 40%"],
            },
          ],
          educationJson: [],
          skillsJson: { technical: ["SQL", "Python"], business: [], soft: [] },
          languagesJson: [],
          certificationsJson: [],
        }),
      },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-profile-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async ({
        loadMasterCvText,
      }: {
        loadMasterCvText: () => Promise<string>;
      }) => {
        aiLoadedText = await loadMasterCvText();
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-profile-1",
          result: {
            adaptedContentJson: { ok: true },
            masterCvText: "valor ignorado",
            previewText: "preview",
          },
        };
      },
    },
  );

  await service.analyzeAuthenticated("user-1", {
    jobDescriptionText:
      "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    inputMode: "profile",
    masterResumeId: "resume-1",
    saveAsMaster: false,
    turnstileToken: "token",
  });

  assert.ok(
    aiLoadedText.includes("Santana de Parnaíba"),
    "masterCvText must include the structured profile location",
  );
  assert.ok(!aiLoadedText.includes("sem cidade nenhuma"));
  assert.equal(
    resumeLookupCalled,
    false,
    "Resume.rawText must never be read in profile mode, even if masterResumeId is sent",
  );
});

test("analyzeAuthenticated with inputMode=profile rejects when UserProfile has no usable content", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      userProfile: {
        findUnique: async () => null,
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("must not reach AI");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async ({
        loadMasterCvText,
      }: {
        loadMasterCvText: () => Promise<string>;
      }) => {
        await loadMasterCvText();
        throw new Error("loadMasterCvText should have thrown first");
      },
    },
  );

  await assert.rejects(
    () =>
      service.analyzeAuthenticated("user-1", {
        jobDescriptionText:
          "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
        inputMode: "profile",
        saveAsMaster: false,
        turnstileToken: "token",
      }),
    /Complete seu CV Base/i,
  );
});

test("create delegates async analysis through protected boundary instead of direct AI call", async () => {
  let directAnalyzeCalls = 0;
  let protectedCalls = 0;

  const now = new Date();
  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => ({ id: "resume-1", rawText: "CV base" }),
      },
      cvAdaptation: {
        create: async () => ({
          adaptedResumeId: null,
          companyName: null,
          createdAt: now,
          id: "adapt-1",
          jobDescriptionText:
            "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
          jobTitle: null,
          masterResumeId: "resume-1",
          paidAt: null,
          paymentStatus: "none",
          previewText: null,
          status: "analyzing",
          template: null,
          templateId: null,
          updatedAt: now,
          userId: "user-1",
        }),
        update: async () => ({}),
      },
    },
    {
      analyzeAndAdapt: async () => {
        directAnalyzeCalls += 1;
      },
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
      executeProtectedAnalyzeAndPersist: async () => {
        protectedCalls += 1;
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: undefined,
        };
      },
    },
  );

  await service.create("user-1", {
    jobDescriptionText:
      "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
    masterResumeId: "resume-1",
  });

  assert.equal(directAnalyzeCalls, 0);
  assert.equal(protectedCalls, 1);
});

test("create rejects profile mode when file upload is provided", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      userProfile: {
        findUnique: async () => ({ profileReadinessStatus: "ready" }),
      },
      resume: {
        findFirst: async () => ({ id: "resume-1", rawText: "CV base" }),
      },
      cvAdaptation: {
        create: async () => {
          throw new Error("cvAdaptation.create should not be called");
        },
      },
    },
    {},
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyzeAndPersist: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: undefined,
      }),
    },
  );

  await assert.rejects(
    service.create(
      "user-1",
      {
        inputMode: "profile",
        jobDescriptionText:
          "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
      },
      makeFile(Buffer.from("resume")),
    ),
    /modo profile/i,
  );
});

test("create rejects profile mode when profile readiness is not ready", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      userProfile: {
        findUnique: async () => ({ profileReadinessStatus: "partial" }),
      },
      cvAdaptation: {
        create: async () => {
          throw new Error("cvAdaptation.create should not be called");
        },
      },
    },
    {},
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyzeAndPersist: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: undefined,
      }),
    },
  );

  await assert.rejects(
    service.create("user-1", {
      inputMode: "profile",
      jobDescriptionText:
        "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
      masterResumeId: "resume-1",
    }),
    /perfil salvo ainda nao esta pronto/i,
  );
});

test("create persists inferred adaptationSource and inputMode", async () => {
  const now = new Date();
  const createCalls: Array<Record<string, unknown>> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => ({ id: "resume-1", rawText: "CV base" }),
      },
      cvAdaptation: {
        create: async (args: Record<string, unknown>) => {
          createCalls.push(args);
          return {
            adaptedResumeId: null,
            companyName: null,
            createdAt: now,
            id: "adapt-1",
            jobDescriptionText:
              "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
            jobTitle: null,
            masterResumeId: "resume-1",
            paidAt: null,
            paymentStatus: "none",
            previewText: null,
            status: "analyzing",
            template: null,
            templateId: null,
            updatedAt: now,
            userId: "user-1",
          };
        },
        update: async () => ({}),
      },
    },
    {},
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyzeAndPersist: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: undefined,
      }),
    },
  );

  await service.create("user-1", {
    inputMode: "file_upload",
    jobDescriptionText:
      "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
    masterResumeId: "resume-1",
  });

  const createData = createCalls[0]?.data as Record<string, unknown>;
  assert.equal(createData.inputMode, "file_upload");
  assert.equal(createData.adaptationSource, "uploaded_content");
  assert.equal(typeof createData.analysisInputSnapshotJson, "object");
  assert.equal(typeof createData.uploadedContentSnapshotJson, "object");
  assert.notDeepEqual(
    createData.analysisInputSnapshotJson,
    createData.uploadedContentSnapshotJson,
  );
});

test("create merges canonical profile from uploaded/text content", async () => {
  const profileUpdates: Array<Record<string, unknown>> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => ({
          id: "resume-1",
          rawText: "Ana Silva\nAnalista\n",
        }),
      },
      userProfile: {
        findUnique: async () => ({
          userId: "user-1",
          city: null,
          country: null,
          educationJson: [],
          experiencesJson: [],
          fullName: null,
          headline: null,
          linkedinUrl: null,
          phone: null,
          professionalSummary: null,
          profileFieldMetaJson: {},
          profileSuggestionsJson: [],
          skillsJson: { technical: [], business: [], soft: [] },
          state: null,
        }),
        update: async (args: Record<string, unknown>) => {
          profileUpdates.push(args);
          return {};
        },
      },
      cvAdaptation: {
        create: async () => ({
          adaptedResumeId: null,
          companyName: null,
          createdAt: new Date(),
          id: "adapt-1",
          jobDescriptionText:
            "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
          jobTitle: null,
          masterResumeId: "resume-1",
          paidAt: null,
          paymentStatus: "none",
          previewText: null,
          status: "analyzing",
          template: null,
          templateId: null,
          updatedAt: new Date(),
          userId: "user-1",
        }),
        update: async () => ({}),
      },
    },
    {},
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyzeAndPersist: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: undefined,
      }),
    },
  );

  await service.create("user-1", {
    inputMode: "text_paste",
    jobDescriptionText:
      "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
    masterResumeId: "resume-1",
  });

  assert.equal(profileUpdates.length, 1);
  const data = profileUpdates[0]?.data as Record<string, unknown>;
  assert.equal(data.profileReadinessStatus, "partial");
});

test("create marks adaptation as failed when protected boundary blocks analysis", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const now = new Date();

  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => ({ id: "resume-1", rawText: "CV base" }),
      },
      cvAdaptation: {
        create: async () => ({
          adaptedResumeId: null,
          companyName: null,
          createdAt: now,
          id: "adapt-1",
          jobDescriptionText:
            "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
          jobTitle: null,
          masterResumeId: "resume-1",
          paidAt: null,
          paymentStatus: "none",
          previewText: null,
          status: "analyzing",
          template: null,
          templateId: null,
          updatedAt: now,
          userId: "user-1",
        }),
        update: async (args: Record<string, unknown>) => {
          updates.push(args);
          return {};
        },
      },
      analysisCvSnapshot: {
        findUnique: async () => ({
          id: "snapshot-1",
          userId: "user-1",
          guestSessionHash: null,
          expiresAt: null,
          claimedAt: null,
          claimedByUserId: null,
        }),
      },
    },
    {
      analyzeAndAdapt: async () => {
        throw new Error("analyzeAndAdapt should not be called directly");
      },
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
      executeProtectedAnalyzeAndPersist: async () => ({
        message: "blocked",
        ok: false,
        reason: "turnstile_invalid",
      }),
    },
  );

  await service.create("user-1", {
    jobDescriptionText:
      "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
    masterResumeId: "resume-1",
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    where: { id: "adapt-1" },
    data: {
      failureReason: "Turnstile verification failed",
      status: "failed",
    },
  });
});

test("saveGuestPreview auto-promotes the first CV to master when the user has none yet, without being asked", async () => {
  const now = new Date();
  let createdMasterWithFlag = 0;
  let createdResumeWithoutMasterFlag = 0;
  let capturedMasterResumeId: string | null = null;

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: {
        findFirst: async () => null,
      },
      resume: {
        findFirst: async ({ where }: { where: { kind?: string } }) => {
          if (where.kind === "master") {
            return null;
          }

          return { id: "adapted-resume-1" };
        },
        create: async ({
          data,
        }: {
          data: {
            isMaster: boolean;
          };
        }) => {
          if (data.isMaster) {
            createdMasterWithFlag += 1;
          } else {
            createdResumeWithoutMasterFlag += 1;
          }
          return { id: "new-master-1" };
        },
      },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async ({
          data,
        }: {
          data: {
            masterResumeId: string;
            templateId: string | null;
          };
        }) => {
          capturedMasterResumeId = data.masterResumeId;
          return {
            adaptedResumeId: null,
            aiAuditJson: null,
            companyName: null,
            createdAt: now,
            failureReason: null,
            id: "adapt-1",
            jobDescriptionText:
              "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
            jobTitle: null,
            masterResumeId: data.masterResumeId,
            paidAt: null,
            paymentStatus: "none",
            previewText: "preview",
            status: "pending",
            template: null,
            templateId: data.templateId,
            updatedAt: now,
            userId: "user-1",
          };
        },
      },
      analysisCvSnapshot: {
        findUnique: async () => ({
          id: "snapshot-1",
          userId: "user-1",
          guestSessionHash: null,
          expiresAt: null,
          claimedAt: null,
          claimedByUserId: null,
        }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
    },
  );

  await service.saveGuestPreview("user-1", {
    adaptedContentJson: { fit: { headline: "ok" } },
    companyName: "EarlyCV",
    jobDescriptionText:
      "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
    jobTitle: "Analista",
    masterCvText: "CV enviado pelo usuario",
    analysisCvSnapshotId: "snapshot-1",
    previewText: "preview",
  });

  assert.equal(createdMasterWithFlag, 1);
  assert.equal(createdResumeWithoutMasterFlag, 0);
  assert.equal(capturedMasterResumeId, "new-master-1");
});

test("saveGuestPreview reuses the existing master and never creates a new resume when the user already has one", async () => {
  const now = new Date();
  let resumeCreateCalls = 0;

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: { findFirst: async () => null },
      resume: {
        findFirst: async ({ where }: { where: { kind?: string } }) => {
          if (where.kind === "master") {
            return { id: "existing-master-1" };
          }
          return { id: "adapted-resume-1" };
        },
        create: async () => {
          resumeCreateCalls += 1;
          return { id: "should-not-be-created" };
        },
      },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async ({
          data,
        }: {
          data: { masterResumeId: string; templateId: string | null };
        }) => ({
          adaptedResumeId: null,
          aiAuditJson: null,
          companyName: null,
          createdAt: now,
          failureReason: null,
          id: "adapt-2",
          jobDescriptionText:
            "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
          jobTitle: null,
          masterResumeId: data.masterResumeId,
          paidAt: null,
          paymentStatus: "none",
          previewText: "preview",
          status: "pending",
          template: null,
          templateId: data.templateId,
          updatedAt: now,
          userId: "user-1",
        }),
      },
      analysisCvSnapshot: {
        findUnique: async () => ({
          id: "snapshot-2",
          userId: "user-1",
          guestSessionHash: null,
          expiresAt: null,
          claimedAt: null,
          claimedByUserId: null,
        }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-2",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
    },
  );

  const adaptation = await service.saveGuestPreview("user-1", {
    adaptedContentJson: { fit: { headline: "ok" } },
    companyName: "EarlyCV",
    jobDescriptionText:
      "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
    jobTitle: "Analista",
    masterCvText: "CV enviado pelo usuario",
    analysisCvSnapshotId: "snapshot-2",
    previewText: "preview",
    // Sem saveAsMaster — usuário já tem master, não pediu pra substituir.
  });

  assert.equal(resumeCreateCalls, 0);
  assert.equal(adaptation.masterResumeId, "existing-master-1");
});

test("saveGuestPreview returns existing adaptation for same snapshot and user", async () => {
  const now = new Date();
  let createCalls = 0;

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: {
        findFirst: async () => null,
      },
      resume: {
        findFirst: async () => ({ id: "master-1" }),
      },
      cvAdaptation: {
        findFirst: async () => ({
          adaptedResumeId: null,
          aiAuditJson: null,
          companyName: "EarlyCV",
          createdAt: now,
          failureReason: null,
          id: "adapt-existing",
          jobDescriptionText:
            "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
          jobTitle: "Analista",
          masterResumeId: "master-1",
          paidAt: null,
          paymentStatus: "none",
          previewText: "preview",
          status: "pending",
          template: null,
          templateId: null,
          updatedAt: now,
          userId: "user-1",
          analysisCvSnapshot: null,
        }),
        findUnique: async () => null,
        create: async () => {
          createCalls += 1;
          throw new Error("should not create duplicate adaptation");
        },
      },
      analysisCvSnapshot: {
        findUnique: async () => ({
          id: "snapshot-1",
          userId: "user-1",
          guestSessionHash: null,
          expiresAt: null,
          claimedAt: null,
          claimedByUserId: null,
        }),
        update: async () => ({ id: "snapshot-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
    },
  );

  const result = await service.saveGuestPreview("user-1", {
    adaptedContentJson: { fit: { headline: "ok" } },
    companyName: "EarlyCV",
    jobDescriptionText:
      "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
    jobTitle: "Analista",
    masterCvText: "CV enviado pelo usuario",
    analysisCvSnapshotId: "snapshot-1",
    previewText: "preview",
  });

  assert.equal(result.id, "adapt-existing");
  assert.equal(createCalls, 0);
});

test("saveGuestPreview accepts original guest session token after login context changes", async () => {
  const now = new Date();
  let createCalls = 0;

  const originalGuestToken = "guest-session-A";
  const originalGuestHash = createHash("sha256")
    .update(originalGuestToken)
    .digest("hex");

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: {
        findFirst: async () => null,
      },
      resume: {
        findFirst: async () => ({ id: "master-1" }),
      },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async () => {
          createCalls += 1;
          return {
            adaptedResumeId: null,
            aiAuditJson: null,
            companyName: "EarlyCV",
            createdAt: now,
            failureReason: null,
            id: "adapt-guest-session",
            jobDescriptionText:
              "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
            jobTitle: "Analista",
            masterResumeId: "master-1",
            paidAt: null,
            paymentStatus: "none",
            previewText: "preview",
            status: "pending",
            template: null,
            templateId: null,
            updatedAt: now,
            userId: "user-1",
            analysisCvSnapshot: null,
          };
        },
      },
      analysisCvSnapshot: {
        findUnique: async () => ({
          id: "snapshot-1",
          userId: null,
          guestSessionHash: originalGuestHash,
          expiresAt: null,
          claimedAt: null,
          claimedByUserId: null,
        }),
        update: async () => ({ id: "snapshot-1" }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
    },
  );

  const result = await service.saveGuestPreview(
    "user-1",
    {
      adaptedContentJson: { fit: { headline: "ok" } },
      companyName: "EarlyCV",
      jobDescriptionText:
        "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
      jobTitle: "Analista",
      masterCvText: "CV enviado pelo usuario",
      analysisCvSnapshotId: "snapshot-1",
      previewText: "preview",
      guestSessionPublicToken: originalGuestToken,
    },
    undefined,
    {
      correlationId: "corr",
      ip: "203.0.113.10",
      requestId: "req",
      sessionInternalId: null,
      sessionPublicToken: "new-authenticated-session-B",
      userId: "user-1",
    },
  );

  assert.equal(result.id, "adapt-guest-session");
  assert.equal(createCalls, 1);
});

test("create forwards turnstileToken to protected create analysis", async () => {
  const capturedTurnstileTokens: Array<string | null | undefined> = [];
  const now = new Date();

  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => ({ id: "resume-1", rawText: "CV base" }),
      },
      cvAdaptation: {
        create: async () => ({
          adaptedResumeId: null,
          companyName: null,
          createdAt: now,
          id: "adapt-1",
          jobDescriptionText:
            "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
          jobTitle: null,
          masterResumeId: "resume-1",
          paidAt: null,
          paymentStatus: "none",
          previewText: null,
          status: "analyzing",
          template: null,
          templateId: null,
          updatedAt: now,
          userId: "user-1",
        }),
      },
    },
    {
      analyzeAndAdapt: async () => {
        throw new Error("analyzeAndAdapt should not be called directly");
      },
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
      executeProtectedAnalyzeAndPersist: async ({
        turnstileToken,
      }: {
        turnstileToken?: string | null;
      }) => {
        capturedTurnstileTokens.push(turnstileToken);
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: undefined,
        };
      },
    },
  );

  await service.create("user-1", {
    jobDescriptionText:
      "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
    masterResumeId: "resume-1",
    turnstileToken: "turnstile-create-token",
  });

  assert.deepEqual(capturedTurnstileTokens, ["turnstile-create-token"]);
});

test("ensureLegacyStructuredOutput uses protected boundary for paid guest output", async () => {
  const updates: Array<Record<string, unknown>> = [];
  let protectedCalls = 0;
  let directCalls = 0;
  let protectedPayload: Record<string, unknown> | null = null;

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        update: async (args: Record<string, unknown>) => {
          updates.push(args);
          return {};
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => {
        directCalls += 1;
        throw new Error("buildPaidCvOutputFromGuest should not be called");
      },
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
      executeProtectedAnalyzeAndPersist: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: undefined,
      }),
      executeProtectedBuildPaidCvOutputFromGuest: async (
        args: Record<string, unknown>,
      ) => {
        protectedCalls += 1;
        protectedPayload = args;
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            summary: "Resumo",
            sections: [],
            highlightedSkills: [],
            removedSections: [],
          },
        };
      },
    },
  );

  // biome-ignore lint/suspicious/noExplicitAny: test mock
  const output = await (service as any).ensureLegacyStructuredOutput({
    adaptedContentJson: {
      fit: { headline: "headline" },
      requirements: [
        {
          requirementKey: "sql-analytics",
          requirementText: "Experiencia com SQL para analise de dados",
          importance: "high",
          coverageStatus: "partial",
          evidence: ["Resumo menciona SQL"],
          gapExplanation: "Sem profundidade em projetos",
          recommendation: "Destacar entregas com SQL",
          impactScore: 18,
        },
      ],
      selectedMissingKeywords: ["Power BI", "Stakeholders"],
    },
    aiAuditJson: null,
    companyName: "Acme",
    id: "adapt-1",
    jobDescriptionText:
      "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    jobTitle: "Engenheiro",
    masterResume: { rawText: "CV" },
    userId: "user-1",
  });

  assert.equal(protectedCalls, 1);
  assert.equal(directCalls, 0);
  assert.equal(output.summary, "Resumo");
  assert.deepEqual(protectedPayload?.requirementCoverage, [
    {
      requirementKey: "sql-analytics",
      requirementText: "Experiencia com SQL para analise de dados",
      importance: "high",
      coverageStatus: "partial",
      evidence: ["Resumo menciona SQL"],
      gapExplanation: "Sem profundidade em projetos",
      recommendation: "Destacar entregas com SQL",
      impactScore: 18,
    },
  ]);
  assert.deepEqual(protectedPayload?.selectedMissingKeywords, [
    "Power BI",
    "Stakeholders",
  ]);
  const aiAuditUpdate = updates.find(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "data" in entry &&
      (entry as { data?: Record<string, unknown> }).data?.aiAuditJson,
  );
  assert.deepEqual(aiAuditUpdate, {
    where: { id: "adapt-1" },
    data: {
      aiAuditJson: {
        summary: "Resumo",
        sections: [],
        highlightedSkills: [],
        removedSections: [],
      },
      language: undefined,
    },
  });
});

test("ensureLegacyStructuredOutput returns null when protected boundary blocks", async () => {
  let protectedCalls = 0;

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        updateMany: async () => ({ count: 1 }),
        update: async () => {
          throw new Error("cvAdaptation.update should not be called");
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => {
        throw new Error("buildPaidCvOutputFromGuest should not be called");
      },
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV base",
          previewText: "preview",
        },
      }),
      executeProtectedAnalyzeAndPersist: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: undefined,
      }),
      executeProtectedBuildPaidCvOutputFromGuest: async () => {
        protectedCalls += 1;
        return {
          message: "blocked",
          ok: false,
          reason: "anti_bot_blocked",
        };
      },
    },
  );

  // biome-ignore lint/suspicious/noExplicitAny: test mock
  const output = await (service as any).ensureLegacyStructuredOutput({
    adaptedContentJson: { fit: { headline: "headline" } },
    aiAuditJson: null,
    companyName: "Acme",
    id: "adapt-1",
    jobDescriptionText:
      "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    jobTitle: "Engenheiro",
    masterResume: { rawText: "CV" },
    userId: "user-1",
  });

  assert.equal(protectedCalls, 1);
  assert.equal(output, null);
});

test("ensureLegacyStructuredOutput persists immutable generation snapshot with null-guard", async () => {
  const updateManyCalls: Array<Record<string, unknown>> = [];

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        updateMany: async (args: Record<string, unknown>) => {
          updateManyCalls.push(args);
          return { count: 1 };
        },
        update: async () => ({}),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => {
        throw new Error("buildPaidCvOutputFromGuest should not be called");
      },
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyzeAndPersist: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: undefined,
      }),
      executeProtectedBuildPaidCvOutputFromGuest: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          summary: "Resumo",
          sections: [],
          highlightedSkills: [],
          removedSections: [],
        },
      }),
    },
  );

  // biome-ignore lint/suspicious/noExplicitAny: test access to private method
  await (service as any).ensureLegacyStructuredOutput({
    adaptedContentJson: { fit: { headline: "headline" } },
    aiAuditJson: null,
    analysisCvSnapshotId: null,
    companyName: "Acme",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    generationInputSnapshotJson: null,
    id: "adapt-1",
    inputMode: "file_upload",
    jobDescriptionText:
      "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    jobTitle: "Engenheiro",
    masterResume: { rawText: "CV" },
    masterResumeId: "resume-1",
    userId: "user-1",
  });

  assert.equal(updateManyCalls.length, 1);
  const where = updateManyCalls[0]?.where as Record<string, unknown>;
  assert.equal(where?.id, "adapt-1");
  assert.equal(
    typeof (where?.generationInputSnapshotJson as { equals?: unknown })?.equals,
    "object",
  );
});

test("analyzeGuest persists snapshot hash from stored markdown content", async () => {
  let storedMarkdown = "";
  let storedSha = "";

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async ({ data }: { data: { textSha256: string } }) => {
          storedSha = data.textSha256;
          return { id: "snapshot-hash-1" };
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-1",
        result: {
          adaptedContentJson: { ok: true },
          masterCvText: "CV texto",
          previewText: "preview",
        },
      }),
    },
    {
      putObject: async (_key: string, body: Buffer) => {
        storedMarkdown = body.toString("utf8");
        return "https://storage.local/snapshot.md";
      },
      getObject: async () => Buffer.alloc(0),
      deleteObject: async () => undefined,
    },
  );

  const result = await service.analyzeGuest(
    "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    undefined,
    validMasterCvText,
    "token",
  );

  assert.equal(result.analysisCvSnapshotId, "snapshot-hash-1");
  assert.equal(
    storedSha,
    createHash("sha256")
      .update(Buffer.from(storedMarkdown, "utf8"))
      .digest("hex"),
  );
});

test("validateAndClaimSnapshot rejects guest session mismatch", async () => {
  const service = new CvAdaptationServiceCtor({}, {}, {}, {}, {}, {});

  await assert.rejects(
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (service as any).validateAndClaimSnapshot({
      tx: {
        analysisCvSnapshot: {
          findUnique: async () => ({
            id: "snapshot-1",
            userId: null,
            guestSessionHash: "session-a-hash",
            expiresAt: null,
            claimedAt: null,
            claimedByUserId: null,
          }),
          update: async () => ({ id: "snapshot-1" }),
        },
      },
      snapshotId: "snapshot-1",
      userId: "user-1",
      guestSessionHash: "session-b-hash",
    }),
    /Snapshot guest session mismatch/,
  );
});

test("validateAndClaimSnapshot rejects expired snapshot", async () => {
  const service = new CvAdaptationServiceCtor({}, {}, {}, {}, {}, {});

  await assert.rejects(
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (service as any).validateAndClaimSnapshot({
      tx: {
        analysisCvSnapshot: {
          findUnique: async () => ({
            id: "snapshot-1",
            userId: null,
            guestSessionHash: "session-hash",
            expiresAt: new Date(Date.now() - 60_000),
            claimedAt: null,
            claimedByUserId: null,
          }),
          update: async () => ({ id: "snapshot-1" }),
        },
      },
      snapshotId: "snapshot-1",
      userId: "user-1",
      guestSessionHash: "session-hash",
    }),
    /Analysis snapshot expired/,
  );
});

test("validateAndClaimSnapshot rejects claim by another user", async () => {
  const service = new CvAdaptationServiceCtor({}, {}, {}, {}, {}, {});

  await assert.rejects(
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (service as any).validateAndClaimSnapshot({
      tx: {
        analysisCvSnapshot: {
          findUnique: async () => ({
            id: "snapshot-1",
            userId: null,
            guestSessionHash: "session-hash",
            expiresAt: null,
            claimedAt: new Date("2026-04-29T10:00:00.000Z"),
            claimedByUserId: "user-a",
          }),
          update: async () => ({ id: "snapshot-1" }),
        },
      },
      snapshotId: "snapshot-1",
      userId: "user-b",
      guestSessionHash: "session-hash",
    }),
    /already claimed/,
  );
});

test("validateAndClaimSnapshot allows guest snapshot without session hash", async () => {
  const service = new CvAdaptationServiceCtor({}, {}, {}, {}, {}, {});

  // biome-ignore lint/suspicious/noExplicitAny: test mock
  const result = await (service as any).validateAndClaimSnapshot({
    tx: {
      analysisCvSnapshot: {
        findUnique: async () => ({
          id: "snapshot-legacy-null-hash",
          userId: null,
          guestSessionHash: null,
          expiresAt: null,
          claimedAt: null,
          claimedByUserId: null,
        }),
        update: async () => ({ id: "snapshot-legacy-null-hash" }),
      },
    },
    snapshotId: "snapshot-legacy-null-hash",
    userId: "user-1",
    guestSessionHash: null,
  });

  assert.equal(result.id, "snapshot-legacy-null-hash");
});

test("resolveGenerationMasterCvText rejects new adaptations without snapshot", async () => {
  const service = new CvAdaptationServiceCtor(
    { analysisCvSnapshot: { findUnique: async () => null } },
    {},
    {},
    {},
    {},
    {},
  );

  await assert.rejects(
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (service as any).resolveGenerationMasterCvText({
      id: "adapt-1",
      adaptedContentJson: {},
      analysisCvSnapshotId: null,
      createdAt: new Date("2026-04-29T14:31:00.000Z"),
      masterResume: { rawText: "master novo" },
    }),
    /cannot be generated/,
  );
});

test("resolveGenerationMasterCvText uses snapshot text instead of current master resume", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      analysisCvSnapshot: {
        findUnique: async () => ({ textStorageKey: "snapshot-key.md" }),
      },
    },
    {},
    {},
    {},
    {},
    {},
    {
      putObject: async () => "",
      getObject: async () => Buffer.from("Texto A do snapshot\n", "utf8"),
      deleteObject: async () => undefined,
    },
  );

  // biome-ignore lint/suspicious/noExplicitAny: test mock
  const text = await (service as any).resolveGenerationMasterCvText({
    id: "adapt-1",
    adaptedContentJson: {},
    analysisCvSnapshotId: "snapshot-1",
    createdAt: new Date("2026-04-29T14:31:00.000Z"),
    masterResume: { rawText: "Texto B alterado no master" },
  });

  assert.equal(text, "Texto A do snapshot");
});

test("analyzeAuthenticated uses the same normalized text for AI load and snapshot storage", async () => {
  let aiLoadedText = "";
  let storedMarkdown = "";
  let storedSha = "";

  const service = new CvAdaptationServiceCtor(
    {
      analysisCvSnapshot: {
        create: async ({ data }: { data: { textSha256: string } }) => {
          storedSha = data.textSha256;
          return { id: "snapshot-1" };
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async ({
        loadMasterCvText,
      }: {
        loadMasterCvText: () => Promise<string>;
      }) => {
        aiLoadedText = await loadMasterCvText();
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: { ok: true },
            masterCvText: "valor ignorado",
            previewText: "preview",
          },
        };
      },
    },
    {
      putObject: async (_key: string, body: Buffer) => {
        storedMarkdown = body.toString("utf8");
        return "https://storage.local/snapshot.md";
      },
      getObject: async () => Buffer.alloc(0),
      deleteObject: async () => undefined,
    },
  );

  const result = await service.analyzeAuthenticated("user-1", {
    jobDescriptionText:
      "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
    masterCvText: `\uFEFF  ${validMasterCvText.replace(/\n/g, "\r\n")}  `,
    saveAsMaster: false,
    turnstileToken: "token",
  });

  assert.equal(aiLoadedText, validMasterCvText);
  assert.equal(storedMarkdown, validMasterCvText);
  assert.equal(result.masterCvText, validMasterCvText);
  assert.equal(
    storedSha,
    createHash("sha256")
      .update(Buffer.from(validMasterCvText, "utf8"))
      .digest("hex"),
  );
});

test("downloadBaseCv denies access when adaptation does not belong to user", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findFirst: async () => null,
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  await assert.rejects(
    service.downloadBaseCv("user-b", "adapt-1", {
      setHeader: () => {},
      send: () => {},
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any),
    /adaptation not found/,
  );
});

test("downloadBaseCv returns original file when available", async () => {
  let contentType = "";
  let disposition = "";
  let sentBuffer = Buffer.alloc(0);

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findFirst: async () => ({
          id: "adapt-1",
          analysisCvSnapshotId: "snapshot-1",
          createdAt: new Date("2026-04-30T00:00:00.000Z"),
        }),
      },
      analysisCvSnapshot: {
        findUnique: async () => ({
          textStorageKey: "text-key.md",
          originalFileStorageKey: "orig-key.pdf",
          originalFileName: "cv-original.pdf",
          originalMimeType: "application/pdf",
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
    {
      putObject: async () => "",
      getObject: async (key: string) => Buffer.from(`file:${key}`),
      deleteObject: async () => undefined,
    },
  );

  await service.downloadBaseCv("user-a", "adapt-1", {
    setHeader: (name: string, value: string) => {
      if (name === "Content-Type") contentType = value;
      if (name === "Content-Disposition") disposition = value;
    },
    send: (value: Buffer) => {
      sentBuffer = value;
    },
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any);

  assert.equal(contentType, "application/pdf");
  assert.equal(disposition, "attachment; filename=cv-original.pdf");
  assert.equal(sentBuffer.toString("utf8"), "file:orig-key.pdf");
});

test("downloadBaseCv falls back to markdown snapshot when original file is absent", async () => {
  let contentType = "";
  let disposition = "";
  let sentBuffer = Buffer.alloc(0);

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findFirst: async () => ({
          id: "adapt-1",
          analysisCvSnapshotId: "snapshot-1",
          createdAt: new Date("2026-04-30T00:00:00.000Z"),
        }),
      },
      analysisCvSnapshot: {
        findUnique: async () => ({
          textStorageKey: "text-key.md",
          originalFileStorageKey: null,
          originalFileName: null,
          originalMimeType: null,
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
    {
      putObject: async () => "",
      getObject: async (key: string) => Buffer.from(`file:${key}`),
      deleteObject: async () => undefined,
    },
  );

  await service.downloadBaseCv("user-a", "adapt-1", {
    setHeader: (name: string, value: string) => {
      if (name === "Content-Type") contentType = value;
      if (name === "Content-Disposition") disposition = value;
    },
    send: (value: Buffer) => {
      sentBuffer = value;
    },
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any);

  assert.equal(contentType, "text/markdown; charset=utf-8");
  assert.equal(disposition, "attachment; filename=cv-base-analise.md");
  assert.equal(sentBuffer.toString("utf8"), "file:text-key.md");
});

test("analyzeGuest normalizes job description before protection payload", async () => {
  let capturedJobDescription = "";

  const service = new CvAdaptationServiceCtor(
    {
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
      resume: { findFirst: async () => null },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async ({
        jobDescriptionText,
      }: {
        jobDescriptionText: string;
      }) => {
        capturedJobDescription = jobDescriptionText;
        return {
          ok: false,
          reason: "turnstile_invalid",
          message: "blocked",
        };
      },
    },
  );

  await assert.rejects(
    service.analyzeGuest(
      "\uFEFF  Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.\r\n",
      undefined,
      validMasterCvText,
      "token",
    ),
  );

  assert.equal(
    capturedJobDescription,
    "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
  );
});

test("analyzeGuest rejects oversized job description before protected analysis", async () => {
  let protectedCalls = 0;
  const service = new CvAdaptationServiceCtor(
    {
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
      resume: { findFirst: async () => null },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => {
        protectedCalls += 1;
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: {},
            previewText: "preview",
            masterCvText: "CV",
          },
        };
      },
    },
  );

  await assert.rejects(
    service.analyzeGuest(
      `Vaga com responsabilidades e requisitos ${"a".repeat(12_100)}`,
      undefined,
      validMasterCvText,
      "token",
    ),
    /12.000 caracteres/i,
  );

  assert.equal(protectedCalls, 0);
});

test("analyzeGuest rejects legacy DOC before protected analysis pipeline", async () => {
  let protectedCalls = 0;

  const service = new CvAdaptationServiceCtor(
    {
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-1" }),
      },
      resume: { findFirst: async () => null },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => {
        protectedCalls += 1;
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: {},
            previewText: "preview",
            masterCvText: "CV",
          },
        };
      },
    },
  );

  await assert.rejects(
    service.analyzeGuest(
      "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
      {
        buffer: Buffer.from("legacy-doc"),
        encoding: "7bit",
        fieldname: "file",
        mimetype: "application/msword",
        originalname: "cv.doc",
        size: 10,
      },
      undefined,
      "token",
    ),
  );

  assert.equal(protectedCalls, 0);
});

test("analyzeGuest emits safe payload_invalid telemetry for rejected upload envelope", async () => {
  let protectedCalls = 0;
  const emitted: Array<{
    eventName: string;
    metadata?: Record<string, unknown>;
  }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-2" }),
      },
      resume: { findFirst: async () => null },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "preview",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => {
        protectedCalls += 1;
        return {
          ok: true,
          cached: false,
          canonicalHash: "hash-1",
          result: {
            adaptedContentJson: {},
            previewText: "preview",
            masterCvText: "CV",
          },
        };
      },
    },
    {
      deleteObject: async () => undefined,
      getObject: async () => Buffer.alloc(0),
      putObject: async () => "",
    },
    {
      emit: async (
        eventName: string,
        _context: unknown,
        input: { metadata?: Record<string, unknown> },
      ) => {
        emitted.push({ eventName, metadata: input.metadata });
      },
    },
  );

  await assert.rejects(
    service.analyzeGuest(
      "Descricao da vaga com requisitos tecnicos, responsabilidades diarias, habilidades esperadas, experiencia necessaria e colaboracao com produto.",
      {
        buffer: Buffer.from("legacy-doc"),
        encoding: "7bit",
        fieldname: "file",
        mimetype: "application/msword",
        originalname: "cv.doc",
        size: 10,
      },
      undefined,
      "token",
      {
        correlationId: "corr-1",
        ip: "203.0.113.10",
        requestId: "req-1",
        sessionInternalId: "session-1",
        sessionPublicToken: "session-public",
        userId: null,
        routePath: "/api/cv-adaptation/analyze-guest",
        userAgentHash: "ua-hash",
      },
    ),
  );

  assert.equal(protectedCalls, 0);
  assert.equal(emitted.length > 0, true);
  assert.equal(emitted[0]?.eventName, "payload_invalid");
  assert.equal(emitted[0]?.metadata?.reason, "upload_extraction_failed");
  assert.equal(emitted[0]?.metadata?.fileExtension, ".doc");
  assert.equal(emitted[0]?.metadata?.mimeType, "application/msword");
  assert.equal("cvText" in (emitted[0]?.metadata ?? {}), false);
  assert.equal("jobDescriptionText" in (emitted[0]?.metadata ?? {}), false);
});

// ─── ETAPA 2: JobApplication hook integration ─────────────────────────────────

const makeAdaptationRecord = (id = "adapt-1") => ({
  id,
  userId: "user-1",
  masterResumeId: "master-1",
  adaptedResumeId: null,
  templateId: null,
  jobApplicationId: null,
  jobTitle: "Engenheiro de Software",
  companyName: "Acme Corp",
  jobDescriptionText:
    "Descricao com requisitos tecnicos e responsabilidades claras.",
  adaptedContentJson: { sections: [] },
  aiAuditJson: { summary: "ok", sections: [] },
  previewText: "preview",
  paymentStatus: "none",
  status: "pending",
  isUnlocked: false,
  unlockedAt: null,
  paidAt: null,
  analysisCvSnapshotId: "snap-1",
  mpPaymentId: null,
  mpMerchantOrderId: null,
  mpPreferenceId: null,
  paymentReference: null,
  paymentAmountInCents: null,
  paymentCurrency: null,
  failureReason: null,
  createdAt: new Date("2026-05-01"),
  updatedAt: new Date("2026-05-01"),
  template: null,
  analysisCvSnapshot: null,
});

const makeOwnedSnapshot = () => ({
  id: "snap-1",
  userId: "user-1",
  guestSessionHash: null,
  expiresAt: null,
  claimedAt: null,
  claimedByUserId: null,
});

const makeHookSpy = () => {
  const calls: unknown[] = [];
  return {
    service: {
      upsertFromCvAdaptation: async (input: unknown) => {
        calls.push(input);
      },
    },
    calls,
  };
};

const noopStorage = {
  deleteObject: async () => undefined as undefined,
  getObject: async () => Buffer.alloc(0),
  putObject: async () => "",
};

const noopTelemetry = { emit: async () => {} };

test("saveGuestPreview: chama upsertFromCvAdaptation com ANALYZED ao criar nova adaptação", async () => {
  const spy = makeHookSpy();
  const adaptation = makeAdaptationRecord();

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: { findFirst: async () => null },
      resume: { findFirst: async () => ({ id: "master-1" }) },
      analysisCvSnapshot: { findUnique: async () => makeOwnedSnapshot() },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async () => adaptation,
      },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  await service.saveGuestPreview("user-1", {
    analysisCvSnapshotId: "snap-1",
    masterCvText: "CV text",
    jobTitle: adaptation.jobTitle,
    companyName: adaptation.companyName,
    jobDescriptionText: adaptation.jobDescriptionText,
    adaptedContentJson: { sections: [] },
    previewText: "preview",
  });

  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.targetStatus, "ANALYZED");
  assert.equal(call.origin, "analysis_auto");
  assert.equal(call.userId, "user-1");
  assert.equal(call.cvAdaptationId, "adapt-1");
});

test("saveGuestPreview: chama upsertFromCvAdaptation com ANALYZED quando adaptação existente é encontrada", async () => {
  const spy = makeHookSpy();
  const existing = makeAdaptationRecord("adapt-existing");

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: { findFirst: async () => null },
      resume: { findFirst: async () => ({ id: "master-1" }) },
      analysisCvSnapshot: { findUnique: async () => makeOwnedSnapshot() },
      cvAdaptation: {
        findFirst: async () => existing,
        findUnique: async () => null,
      },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  await service.saveGuestPreview("user-1", {
    analysisCvSnapshotId: "snap-1",
    masterCvText: "CV text",
    jobDescriptionText: existing.jobDescriptionText,
    adaptedContentJson: {},
  });

  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.targetStatus, "ANALYZED");
  assert.equal(call.origin, "analysis_auto");
  assert.equal(call.cvAdaptationId, "adapt-existing");
});

test("saveGuestPreview retorna adaptação mesmo sem jobTitle/companyName e não bloqueia entrega da análise", async () => {
  const spy = makeHookSpy();
  const adaptation = {
    ...makeAdaptationRecord("adapt-no-identity"),
    jobTitle: null,
    companyName: null,
  };

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: { findFirst: async () => null },
      resume: { findFirst: async () => ({ id: "master-1" }) },
      analysisCvSnapshot: { findUnique: async () => makeOwnedSnapshot() },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async () => adaptation,
      },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  const result = await service.saveGuestPreview("user-1", {
    analysisCvSnapshotId: "snap-1",
    masterCvText: "CV text",
    jobDescriptionText: adaptation.jobDescriptionText,
    adaptedContentJson: { sections: [] },
    previewText: "preview",
  });

  assert.equal(result.id, "adapt-no-identity");
  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.jobTitle, null);
  assert.equal(call.companyName, null);
  assert.equal(call.targetStatus, "ANALYZED");
});

test("persistApplicationIdentity atualiza identidade ausente e chama upsert manual", async () => {
  const spy = makeHookSpy();
  const updateCalls: Array<Record<string, unknown>> = [];

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findFirst: async () => ({
          ...makeAdaptationRecord("adapt-identity"),
          jobTitle: null,
          companyName: null,
          status: "pending",
        }),
        update: async (input: Record<string, unknown>) => {
          updateCalls.push(input);
          return {
            ...makeAdaptationRecord("adapt-identity"),
            jobTitle: "Senior Engineer",
            companyName: "Acme",
            status: "pending",
          };
        },
      },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  await service.persistApplicationIdentity("user-1", "adapt-identity", {
    jobTitle: "  Senior Engineer  ",
    companyName: "  Acme  ",
  });

  assert.equal(updateCalls.length, 1);
  const updateData = updateCalls[0]?.data as Record<string, unknown>;
  assert.equal(updateData.jobTitle, "Senior Engineer");
  assert.equal(updateData.companyName, "Acme");

  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.cvAdaptationId, "adapt-identity");
  assert.equal(call.jobTitle, "Senior Engineer");
  assert.equal(call.companyName, "Acme");
  assert.equal(call.targetStatus, "ANALYZED");
  assert.equal(call.origin, "optimized_cv_auto");
});

test("claimGuest: chama upsertFromCvAdaptation com CV_READY e origin optimized_cv_auto", async () => {
  const spy = makeHookSpy();
  const adaptation = makeAdaptationRecord("adapt-claimed");

  const mockTx = {
    resume: {
      findFirst: async () => ({ id: "master-1" }),
      create: async () => ({ id: "adapted-resume-1" }),
    },
    cvAdaptation: {
      create: async () => adaptation,
      update: async () => adaptation,
    },
    user: { update: async () => ({}) },
    cvUnlock: { create: async () => ({}) },
    analysisCvSnapshot: { findUnique: async () => makeOwnedSnapshot() },
  };

  const service = new CvAdaptationServiceCtor(
    {
      user: {
        findUnique: async () => ({ creditsRemaining: 5, internalRole: "user" }),
      },
      resumeTemplate: { findFirst: async () => null },
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx),
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  await service.claimGuest("user-1", {
    adaptedContentJson: { sections: [] },
    jobDescriptionText: adaptation.jobDescriptionText,
    masterCvText: "CV text",
    analysisCvSnapshotId: "snap-1",
    jobTitle: adaptation.jobTitle,
    companyName: adaptation.companyName,
  });

  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.targetStatus, "CV_READY");
  assert.equal(call.origin, "optimized_cv_auto");
  assert.equal(call.userId, "user-1");
  assert.equal(call.cvAdaptationId, "adapt-claimed");
});

test("claimGuest: repassa visitorId/journeySessionInternalId do analysisContext para o hook — candidatura_created automática não deve perder a jornada da análise", async () => {
  const spy = makeHookSpy();
  const adaptation = makeAdaptationRecord("adapt-claimed-ctx");

  const mockTx = {
    resume: {
      findFirst: async () => ({ id: "master-1" }),
      create: async () => ({ id: "adapted-resume-1" }),
    },
    cvAdaptation: {
      create: async () => adaptation,
      update: async () => adaptation,
    },
    user: { update: async () => ({}) },
    cvUnlock: { create: async () => ({}) },
    analysisCvSnapshot: { findUnique: async () => makeOwnedSnapshot() },
  };

  const service = new CvAdaptationServiceCtor(
    {
      user: {
        findUnique: async () => ({ creditsRemaining: 5, internalRole: "user" }),
      },
      resumeTemplate: { findFirst: async () => null },
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx),
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  await service.claimGuest(
    "user-1",
    {
      adaptedContentJson: { sections: [] },
      jobDescriptionText: adaptation.jobDescriptionText,
      masterCvText: "CV text",
      analysisCvSnapshotId: "snap-1",
      jobTitle: adaptation.jobTitle,
      companyName: adaptation.companyName,
    },
    {
      correlationId: "corr-1",
      requestId: "req-1",
      sessionPublicToken: null,
      sessionInternalId: null,
      journeySessionInternalId: "journey-abc",
      visitorId: "visitor-abc",
      userId: null,
      ip: null,
      routePath: "/adaptar",
      userAgentHash: null,
    },
  );

  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.visitorId, "visitor-abc");
  assert.equal(call.journeySessionInternalId, "journey-abc");
});

test("deliverAdaptation: chama upsertFromCvAdaptation com CV_READY após persistir adaptedResume", async () => {
  const spy = makeHookSpy();
  const adaptation = makeAdaptationRecord("adapt-delivered");

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findUnique: async () => ({
          ...adaptation,
          masterResume: { title: "CV Base", rawText: "CV text" },
          template: null,
        }),
        update: async () => ({}),
      },
      resume: { create: async () => ({ id: "adapted-resume-1" }) },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  const svc = service as unknown as {
    deliverAdaptation: (id: string) => Promise<void>;
  };
  await svc.deliverAdaptation("adapt-delivered");

  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.targetStatus, "CV_READY");
  assert.equal(call.origin, "optimized_cv_auto");
  assert.equal(call.cvAdaptationId, "adapt-delivered");
  assert.equal(call.userId, "user-1");
});

test("deliverAdaptation: chamada repetida chama hook duas vezes — dedup delegado ao JobApplicationsService", async () => {
  const spy = makeHookSpy();
  const adaptation = makeAdaptationRecord("adapt-repeat");
  let resumeCreateCount = 0;

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findUnique: async () => ({
          ...adaptation,
          masterResume: { title: "CV", rawText: "text" },
          template: null,
        }),
        update: async () => ({}),
      },
      resume: {
        create: async () => ({ id: `adapted-${++resumeCreateCount}` }),
      },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  const svc = service as unknown as {
    deliverAdaptation: (id: string) => Promise<void>;
  };
  await svc.deliverAdaptation("adapt-repeat");
  await svc.deliverAdaptation("adapt-repeat");

  assert.equal(spy.calls.length, 2);
  const c0 = spy.calls[0] as Record<string, unknown>;
  const c1 = spy.calls[1] as Record<string, unknown>;
  assert.equal(c0.cvAdaptationId, "adapt-repeat");
  assert.equal(c1.cvAdaptationId, "adapt-repeat");
});

test("hook repassa cvAdaptationId, jobDescriptionText e userId corretos ao JobApplicationsService", async () => {
  const spy = makeHookSpy();
  const adaptation = makeAdaptationRecord("adapt-fields");

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findUnique: async () => ({
          ...adaptation,
          id: "adapt-fields",
          masterResume: { title: "CV", rawText: "text" },
          template: null,
        }),
        update: async () => ({}),
      },
      resume: { create: async () => ({ id: "adapted-1" }) },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  const svc = service as unknown as {
    deliverAdaptation: (id: string) => Promise<void>;
  };
  await svc.deliverAdaptation("adapt-fields");

  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.cvAdaptationId, "adapt-fields");
  assert.equal(call.userId, "user-1");
  assert.equal(call.jobDescriptionText, adaptation.jobDescriptionText);
  assert.equal(call.jobTitle, adaptation.jobTitle);
  assert.equal(call.companyName, adaptation.companyName);
});

test("hook envia targetStatus correto — regra de não rebaixar status é responsabilidade do JobApplicationsService", async () => {
  const spy = makeHookSpy();
  const adaptation = makeAdaptationRecord();

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: { findFirst: async () => null },
      resume: { findFirst: async () => ({ id: "master-1" }) },
      analysisCvSnapshot: { findUnique: async () => makeOwnedSnapshot() },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async () => adaptation,
      },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    spy.service,
  );

  await service.saveGuestPreview("user-1", {
    analysisCvSnapshotId: "snap-1",
    masterCvText: "CV",
    jobDescriptionText: adaptation.jobDescriptionText,
    adaptedContentJson: {},
  });

  assert.equal(spy.calls.length, 1);
  const call = spy.calls[0] as Record<string, unknown>;
  assert.equal(call.targetStatus, "ANALYZED");
  assert.equal(call.origin, "analysis_auto");
});

test("falha no upsertFromCvAdaptation não quebra fluxo do deliverAdaptation", async () => {
  let updateCalled = false;
  const adaptation = makeAdaptationRecord("adapt-failhook");

  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findUnique: async () => ({
          ...adaptation,
          masterResume: { title: "CV", rawText: "text" },
          template: null,
        }),
        update: async () => {
          updateCalled = true;
          return {};
        },
      },
      resume: { create: async () => ({ id: "adapted-1" }) },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    {
      upsertFromCvAdaptation: async () => {
        throw new Error("JobApplicationsService indisponivel");
      },
    },
  );

  const svc = service as unknown as {
    deliverAdaptation: (id: string) => Promise<void>;
  };
  await svc.deliverAdaptation("adapt-failhook");

  assert.ok(
    updateCalled,
    "cvAdaptation.update deve ter sido chamado antes do hook",
  );
});

test("falha no upsertFromCvAdaptation não quebra fluxo do saveGuestPreview", async () => {
  const adaptation = makeAdaptationRecord();

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: { findFirst: async () => null },
      resume: { findFirst: async () => ({ id: "master-1" }) },
      analysisCvSnapshot: { findUnique: async () => makeOwnedSnapshot() },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async () => adaptation,
      },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
    {
      upsertFromCvAdaptation: async () => {
        throw new Error("DB timeout");
      },
    },
  );

  const result = await service.saveGuestPreview("user-1", {
    analysisCvSnapshotId: "snap-1",
    masterCvText: "CV",
    jobDescriptionText: adaptation.jobDescriptionText,
    adaptedContentJson: {},
  });

  assert.ok(
    result.id,
    "saveGuestPreview deve retornar adaptação mesmo com falha no hook",
  );
});

test("service mantém comportamento sem jobApplicationsService explícito — backward compat", async () => {
  const adaptation = makeAdaptationRecord();

  // Only 8 constructor args — jobApplicationsService uses default no-op
  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: { findFirst: async () => null },
      resume: { findFirst: async () => ({ id: "master-1" }) },
      analysisCvSnapshot: { findUnique: async () => makeOwnedSnapshot() },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async () => adaptation,
      },
    },
    {},
    {},
    {},
    {},
    {},
    noopStorage,
    noopTelemetry,
  );

  const result = await service.saveGuestPreview("user-1", {
    analysisCvSnapshotId: "snap-1",
    masterCvText: "CV",
    jobDescriptionText: adaptation.jobDescriptionText,
    adaptedContentJson: {},
  });

  assert.ok(
    result.id,
    "adaptação deve ser retornada sem jobApplicationsService explícito",
  );
});

test("resolveExistingKeywordRule filtra frases contaminadas e preserva apenas a seleção original do usuário", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findMany: async () => [
          {
            adaptedContentJson: {
              keywords: {
                presentes: [
                  { kw: "histórias de usuário", pontos: 5 },
                  { kw: "critérios de aceite", pontos: 5 },
                  { kw: "mercado financeiro", pontos: 1 },
                ],
                possiveis: [{ kw: "produto digital", pontos: 1 }],
                ausentes: [
                  {
                    kw: "Escrita de histórias de usuário e critérios de aceite",
                    pontos: 1,
                  },
                  { kw: "Experiência em mercado financeiro", pontos: 1 },
                ],
              },
            },
          },
          {
            adaptedContentJson: {
              selectedMissingKeywords: [
                "histórias de usuário",
                "critérios de aceite",
                "mercado financeiro",
              ],
              keywords: {
                ausentes: [
                  { kw: "histórias de usuário", pontos: 5 },
                  { kw: "critérios de aceite", pontos: 5 },
                  { kw: "mercado financeiro", pontos: 1 },
                ],
              },
            },
          },
        ],
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => ({
        adaptedContentJson: {},
        previewText: "",
      }),
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash",
        result: {
          adaptedContentJson: {},
          masterCvText: "CV",
          previewText: "preview",
        },
      }),
    },
  );

  const serviceWithPrivate = service as CvAdaptationService & {
    resolveExistingKeywordRule(input: {
      userId: string | null;
      jobRequirementSetId: string | null;
    }): Promise<
      | {
          presentes: Array<{ kw: string; pontos: number }>;
          possiveis: Array<{ kw: string; pontos: number }>;
          ausentes: Array<{ kw: string; pontos: number }>;
        }
      | undefined
    >;
  };

  const rule = await serviceWithPrivate.resolveExistingKeywordRule({
    userId: "user-1",
    jobRequirementSetId: "req-1",
  });

  assert.deepEqual(rule, {
    presentes: [
      { kw: "histórias de usuário", pontos: 5 },
      { kw: "critérios de aceite", pontos: 5 },
      { kw: "mercado financeiro", pontos: 1 },
    ],
    possiveis: [{ kw: "produto digital", pontos: 1 }],
    ausentes: [],
  });
});

test("getContent: isLegacyFormat is false when a snapshot exists, even without sections yet", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findFirst: async () => ({
          id: "adapt-1",
          userId: "user-1",
          adaptedContentJson: { vaga: { cargo: "Dev" } },
          aiAuditJson: null,
          editedCvJson: null,
          analysisCvSnapshotId: "snapshot-1",
          masterResume: { rawText: null },
          status: "delivered",
          paymentStatus: "completed",
          isUnlocked: true,
          jobTitle: null,
          companyName: null,
          jobDescriptionText: "",
          jobApplicationId: null,
        }),
        count: async () => 0,
        update: async () => ({}),
      },
    },
    {},
    {},
    {},
    {},
    {},
    {},
  );

  const result = await service.getContent("user-1", "adapt-1");
  assert.equal(result.isLegacyFormat, false);
});

test("getContent: isLegacyFormat is true only when there is no snapshot and no base CV text at all", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      cvAdaptation: {
        findFirst: async () => ({
          id: "adapt-1",
          userId: "user-1",
          adaptedContentJson: { vaga: { cargo: "Dev" } },
          aiAuditJson: null,
          editedCvJson: null,
          analysisCvSnapshotId: null,
          masterResume: { rawText: null },
          status: "delivered",
          paymentStatus: "completed",
          isUnlocked: true,
          jobTitle: null,
          companyName: null,
          jobDescriptionText: "",
          jobApplicationId: null,
        }),
        count: async () => 0,
        update: async () => ({}),
      },
    },
    {},
    {},
    {},
    {},
    {},
    {},
  );

  const result = await service.getContent("user-1", "adapt-1");
  assert.equal(result.isLegacyFormat, true);
});

test("startGuestAnalysisJob returns immediately with a pending job and fills it in the background on success", async () => {
  const jobUpdates: Array<{ data: Record<string, unknown> }> = [];
  let createdJob: Record<string, unknown> | null = null;

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-async-1" }),
      },
      analysisJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdJob = { id: "job-async-1", ...data };
          return createdJob;
        },
        update: async (args: { data: Record<string, unknown> }) => {
          jobUpdates.push(args);
          return args;
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-async-1",
        result: {
          adaptedContentJson: {
            vaga: { cargo: "Analista de Dados", empresa: "EarlyCV" },
            scoreBefore: 62,
            scoreAfter: 88.4,
          },
          masterCvText: "CV completo extraído",
          previewText: "preview",
        },
      }),
    },
  );

  const started = await service.startGuestAnalysisJob(
    "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    undefined,
    "Resumo do candidato com experiencia relevante para a vaga.",
    "token",
    {
      correlationId: "corr",
      ip: "203.0.113.10",
      requestId: "req",
      sessionInternalId: null,
      sessionPublicToken: "guest-session-token",
      userId: null,
    },
  );

  // Volta na hora, "pending" — a chamada de IA (mockada com executeProtectedAnalyze)
  // ainda nem rodou nesse ponto do teste.
  assert.equal(started.status, "pending");
  assert.equal(started.jobId, "job-async-1");
  assert.equal(
    (createdJob as Record<string, unknown> | null)?.status,
    "pending",
  );

  await sleep(20);

  const statuses = jobUpdates.map((u) => u.data.status);
  assert.deepEqual(statuses, ["processing", "succeeded"]);

  const finalUpdate = jobUpdates[jobUpdates.length - 1]?.data;
  assert.equal(finalUpdate?.previewText, "preview");
  assert.equal(finalUpdate?.masterCvText, "CV completo extraído");
  assert.equal(finalUpdate?.analysisCvSnapshotId, "snapshot-async-1");
  assert.equal(finalUpdate?.jobTitle, "Analista de Dados");
  assert.equal(finalUpdate?.companyName, "EarlyCV");
  assert.equal(finalUpdate?.scoreBefore, 62);
  assert.equal(finalUpdate?.scoreAfter, 88);
});

test("startGuestAnalysisJob marks the job as failed when the background analysis throws", async () => {
  const jobUpdates: Array<{ data: Record<string, unknown> }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisJob: {
        create: async () => ({ id: "job-async-fail-1" }),
        update: async (args: { data: Record<string, unknown> }) => {
          jobUpdates.push(args);
          return args;
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => {
        throw new Error("modelo indisponível");
      },
    },
  );

  await service.startGuestAnalysisJob(
    "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    undefined,
    "Resumo do candidato com experiencia relevante para a vaga.",
    "token",
    undefined,
  );

  await sleep(20);

  const statuses = jobUpdates.map((u) => u.data.status);
  assert.deepEqual(statuses, ["processing", "failed"]);
  assert.match(
    String(jobUpdates[jobUpdates.length - 1]?.data.lastError),
    /modelo indisponível/,
  );
});

// ─── Analytics v2 Fase B: analysis_started/completed/failed, cv_upload_completed ───

test("startGuestAnalysisJob emits analysis_started once and analysis_completed on success, never analysis_failed", async () => {
  const recordedEvents: Array<{
    eventName: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: { create: async () => ({ id: "snapshot-evt-1" }) },
      analysisJob: {
        create: async () => ({ id: "job-evt-1" }),
        update: async (args: { data: Record<string, unknown> }) => args,
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-evt-1",
        result: {
          adaptedContentJson: { vaga: {} },
          masterCvText: "CV completo",
          previewText: "preview",
        },
      }),
    },
    undefined, // storage
    undefined, // analysisTelemetry
    undefined, // jobApplicationsService
    undefined, // profileMergeService
    undefined, // profileReadinessService
    undefined, // jobCanonicalizationService
    undefined, // jobRequirementSetsService
    undefined, // talentProfileCapture
    undefined, // masterCvCanonicalExtractionService
    {
      record: async (input: {
        eventName: string;
        idempotencyKey?: string;
        metadata?: Record<string, unknown>;
      }) => {
        recordedEvents.push(input);
        return { event: {}, ingested: true };
      },
    },
  );

  await service.startGuestAnalysisJob(
    "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    undefined,
    "Resumo do candidato com experiencia relevante para a vaga.",
    "token",
    undefined,
  );

  await sleep(20);

  const eventNames = recordedEvents.map((e) => e.eventName);
  assert.deepEqual(
    eventNames.filter((n) => n.startsWith("analysis_")),
    ["analysis_started", "analysis_completed"],
  );

  const started = recordedEvents.find(
    (e) => e.eventName === "analysis_started",
  );
  assert.equal(started?.idempotencyKey, "analysis_started:job-evt-1");

  const completed = recordedEvents.find(
    (e) => e.eventName === "analysis_completed",
  );
  assert.equal(completed?.idempotencyKey, "analysis_completed:job-evt-1");
  assert.equal(completed?.metadata?.mode, "guest");
  assert.equal(completed?.metadata?.cv_source, "master_cv");
  assert.equal(typeof completed?.metadata?.processing_time_ms, "number");
});

test("startGuestAnalysisJob: visitor_id/sessionInternalId do analysisContext chegam a analysis_started/completed — a mesma jornada guest do analyze_submit_clicked não pode ter buraco", async () => {
  const recordedEvents: Array<{
    eventName: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: { create: async () => ({ id: "snapshot-evt-ctx" }) },
      analysisJob: {
        create: async () => ({ id: "job-evt-ctx" }),
        update: async (args: { data: Record<string, unknown> }) => args,
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-evt-ctx",
        result: {
          adaptedContentJson: { vaga: {} },
          masterCvText: "CV completo",
          previewText: "preview",
        },
      }),
    },
    undefined, // storage
    undefined, // analysisTelemetry
    undefined, // jobApplicationsService
    undefined, // profileMergeService
    undefined, // profileReadinessService
    undefined, // jobCanonicalizationService
    undefined, // jobRequirementSetsService
    undefined, // talentProfileCapture
    undefined, // masterCvCanonicalExtractionService
    {
      record: async (input: {
        eventName: string;
        idempotencyKey?: string;
        metadata?: Record<string, unknown>;
      }) => {
        recordedEvents.push(input);
        return { event: {}, ingested: true };
      },
    },
  );

  await service.startGuestAnalysisJob(
    "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    undefined,
    "Resumo do candidato com experiencia relevante para a vaga.",
    "token",
    {
      correlationId: "corr-2",
      requestId: "req-2",
      sessionPublicToken: "guest-token-1",
      sessionInternalId: null,
      journeySessionInternalId: "journey-guest-1",
      visitorId: "visitor-guest-1",
      userId: null,
      ip: null,
      routePath: "/adaptar",
      userAgentHash: null,
    },
  );

  await sleep(20);

  const started = recordedEvents.find(
    (e) => e.eventName === "analysis_started",
  );
  const completed = recordedEvents.find(
    (e) => e.eventName === "analysis_completed",
  );
  assert.equal(started?.metadata?.visitor_id, "visitor-guest-1");
  assert.equal(started?.metadata?.sessionInternalId, "journey-guest-1");
  assert.equal(completed?.metadata?.visitor_id, "visitor-guest-1");
  assert.equal(completed?.metadata?.sessionInternalId, "journey-guest-1");
});

test("startGuestAnalysisJob emits analysis_started and analysis_failed on failure, never analysis_completed", async () => {
  const recordedEvents: Array<{
    eventName: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisJob: {
        create: async () => ({ id: "job-evt-2" }),
        update: async (args: { data: Record<string, unknown> }) => args,
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => {
        throw new Error("modelo indisponível");
      },
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      record: async (input: {
        eventName: string;
        idempotencyKey?: string;
        metadata?: Record<string, unknown>;
      }) => {
        recordedEvents.push(input);
        return { event: {}, ingested: true };
      },
    },
  );

  await service.startGuestAnalysisJob(
    "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    undefined,
    "Resumo do candidato com experiencia relevante para a vaga.",
    "token",
    undefined,
  );

  await sleep(20);

  const eventNames = recordedEvents.map((e) => e.eventName);
  assert.deepEqual(
    eventNames.filter((n) => n.startsWith("analysis_")),
    ["analysis_started", "analysis_failed"],
  );

  const failed = recordedEvents.find((e) => e.eventName === "analysis_failed");
  assert.equal(failed?.idempotencyKey, "analysis_failed:job-evt-2");
  assert.equal(failed?.metadata?.stage, "processing");
  assert.equal(failed?.metadata?.error_code, "processing_failed");
  assert.equal(failed?.metadata?.retryable, true);
  // Sem mensagem de erro livre no evento — só stage/error_code controlados.
  assert.equal("errorMessage" in (failed?.metadata ?? {}), false);
});

test("analyzeGuest emits cv_upload_completed only after the backend accepts the uploaded file", async () => {
  const recordedEvents: Array<{ eventName: string; idempotencyKey?: string }> =
    [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: { create: async () => ({ id: "snapshot-cv-1" }) },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-cv-1",
        result: {
          adaptedContentJson: {},
          masterCvText: "CV extraído",
          previewText: "preview",
        },
      }),
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      record: async (input: { eventName: string; idempotencyKey?: string }) => {
        recordedEvents.push(input);
        return { event: {}, ingested: true };
      },
    },
  );

  await service.analyzeGuest(
    "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    makeFile(Buffer.from("%PDF-1.4 conteudo de cv valido")),
    undefined,
    "token",
    undefined,
  );

  const cvUploadEvents = recordedEvents.filter(
    (e) => e.eventName === "cv_upload_completed",
  );
  assert.equal(cvUploadEvents.length, 1);
});

// ─── startAuthenticatedAnalysisJob + radarJobId (fluxo de 1 clique) ───────────

test("startAuthenticatedAnalysisJob prefers the radar Job's title/company over what the AI re-extracts from the text", async () => {
  const jobUpdates: Array<{ data: Record<string, unknown> }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: {
        findFirst: async () => ({ id: "resume-1", rawText: "CV base" }),
      },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-radar-1" }),
      },
      analysisJob: {
        create: async () => ({ id: "job-radar-title-1" }),
        update: async (args: { data: Record<string, unknown> }) => {
          jobUpdates.push(args);
          return args;
        },
      },
      job: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          assert.equal(where.id, "job-abc");
          return {
            id: "job-abc",
            title: "Coordenador de BI",
            status: "active",
            descriptionClean:
              "Descricao da vaga sem repetir o cargo ou o nome da empresa no corpo do texto colado.",
            company: { name: "HAPVIDA" },
          };
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-radar-1",
        result: {
          // A IA não achou cargo/empresa no texto colado — exatamente o
          // caso real investigado (radar job com dado real disponível,
          // mas o texto extraído não repete cargo/empresa no corpo).
          adaptedContentJson: {
            vaga: { cargo: "Não informado", empresa: "Não informado" },
            scoreBefore: 60,
            scoreAfter: 85,
          },
          masterCvText: "CV completo",
          previewText: "preview",
        },
      }),
    },
  );

  await service.startAuthenticatedAnalysisJob("user-1", {
    masterResumeId: "resume-1",
    radarJobId: "job-abc",
    turnstileToken: "token",
  });

  await sleep(20);

  const finalUpdate = jobUpdates[jobUpdates.length - 1]?.data;
  assert.equal(finalUpdate?.jobTitle, "Coordenador de BI");
  assert.equal(finalUpdate?.companyName, "HAPVIDA");

  // Regressão: bug real investigado em 2026-09-02 (CvAdaptation
  // cmtkce568002kqwyu5h21a8kd) — as colunas-irmãs jobTitle/companyName já
  // vinham certas há dois fixes anteriores (52f6ffb, 1b6e411), mas o
  // vaga.cargo/vaga.empresa embutido no PRÓPRIO adaptedContentJson nunca
  // era corrigido — e é isso que /adaptar/resultado de fato renderiza.
  const persistedContent = finalUpdate?.adaptedContentJson as {
    vaga: { cargo: string; empresa: string };
  };
  assert.equal(persistedContent.vaga.cargo, "Coordenador de BI");
  assert.equal(persistedContent.vaga.empresa, "HAPVIDA");
});

test("startGuestAnalysisJob (radar) also reconciles jobTitle/companyName and the embedded vaga.{cargo,empresa} — the guest flow never had this fix before", async () => {
  const jobUpdates: Array<{ data: Record<string, unknown> }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-guest-radar-1" }),
      },
      analysisJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "job-guest-radar-1",
          ...data,
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          jobUpdates.push(args);
          return args;
        },
      },
      job: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          assert.equal(where.id, "job-abc-guest");
          return {
            id: "job-abc-guest",
            title: "Coordenador de BI",
            status: "active",
            descriptionClean: "desc",
            company: { name: "HAPVIDA" },
          };
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-guest-radar-1",
        result: {
          // A IA não achou cargo/empresa no texto colado — mesmo caso real
          // investigado, agora reproduzido no fluxo guest.
          adaptedContentJson: {
            vaga: { cargo: "Não informado", empresa: "Não informado" },
            scoreBefore: 60,
            scoreAfter: 85,
          },
          masterCvText: "CV completo",
          previewText: "preview",
        },
      }),
    },
  );

  await service.startGuestAnalysisJob(
    "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
    undefined,
    validMasterCvText,
    "token",
    undefined,
    "job-abc-guest",
  );

  await sleep(20);

  const finalUpdate = jobUpdates[jobUpdates.length - 1]?.data;
  assert.equal(finalUpdate?.jobTitle, "Coordenador de BI");
  assert.equal(finalUpdate?.companyName, "HAPVIDA");
  const persistedContent = finalUpdate?.adaptedContentJson as {
    vaga: { cargo: string; empresa: string };
  };
  assert.equal(persistedContent.vaga.cargo, "Coordenador de BI");
  assert.equal(persistedContent.vaga.empresa, "HAPVIDA");
});

test("startAuthenticatedAnalysisJob with a valid radarJobId loads descriptionClean from the Job", async () => {
  let createdJob: Record<string, unknown> | null = null;

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => ({ rawText: "CV base" }) },
      analysisJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdJob = { id: "job-radar-1", ...data };
          return createdJob;
        },
        update: async (args: { data: Record<string, unknown> }) => args,
      },
      job: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          assert.equal(where.id, "job-abc");
          return {
            id: "job-abc",
            status: "active",
            descriptionClean:
              "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
          };
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => {
        throw new Error("not exercised in this test");
      },
    },
  );

  const started = await service.startAuthenticatedAnalysisJob("user-1", {
    masterResumeId: "resume-1",
    radarJobId: "job-abc",
    turnstileToken: "token",
  });

  assert.equal(started.status, "pending");
  assert.equal(
    (createdJob as Record<string, unknown> | null)?.jobDescriptionText,
    "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.",
  );
});

test("startAuthenticatedAnalysisJob: analysis_started/completed carregam user_id (da coluna) e visitor_id/sessionInternalId (do analysisContext) juntos", async () => {
  const recordedEvents: Array<{
    eventName: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => ({ rawText: "CV base do usuario" }) },
      analysisCvSnapshot: {
        create: async () => ({ id: "snapshot-auth-ctx" }),
      },
      analysisJob: {
        create: async () => ({ id: "job-auth-ctx" }),
        update: async (args: { data: Record<string, unknown> }) => args,
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash-auth-ctx",
        result: {
          adaptedContentJson: { vaga: {} },
          masterCvText: "CV completo",
          previewText: "preview",
        },
      }),
    },
    undefined, // storage
    undefined, // analysisTelemetry
    undefined, // jobApplicationsService
    undefined, // profileMergeService
    undefined, // profileReadinessService
    undefined, // jobCanonicalizationService
    undefined, // jobRequirementSetsService
    undefined, // talentProfileCapture
    undefined, // masterCvCanonicalExtractionService
    {
      record: async (input: {
        eventName: string;
        idempotencyKey?: string;
        metadata?: Record<string, unknown>;
      }) => {
        recordedEvents.push(input);
        return { event: {}, ingested: true };
      },
    },
  );

  await service.startAuthenticatedAnalysisJob(
    "user-auth-1",
    {
      masterResumeId: "resume-1",
      jobDescriptionText:
        "Vaga com requisitos, responsabilidades e experiencia em analise de dados e produto.",
      turnstileToken: "token",
    },
    undefined,
    {
      correlationId: "corr-3",
      requestId: "req-3",
      sessionPublicToken: null,
      sessionInternalId: null,
      journeySessionInternalId: "journey-auth-1",
      visitorId: "visitor-auth-1",
      userId: "user-auth-1",
      ip: null,
      routePath: "/adaptar",
      userAgentHash: null,
    },
  );

  await sleep(20);

  const started = recordedEvents.find(
    (e) => e.eventName === "analysis_started",
  );
  const completed = recordedEvents.find(
    (e) => e.eventName === "analysis_completed",
  );
  assert.equal(started?.metadata?.visitor_id, "visitor-auth-1");
  assert.equal(started?.metadata?.sessionInternalId, "journey-auth-1");
  assert.equal(completed?.metadata?.visitor_id, "visitor-auth-1");
  assert.equal(completed?.metadata?.sessionInternalId, "journey-auth-1");
});

test("startAuthenticatedAnalysisJob throws NotFoundException when radarJobId does not exist", async () => {
  const service = new CvAdaptationServiceCtor(
    { job: { findUnique: async () => null } },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    { precheckTurnstile: async () => ({ ok: true }) },
  );

  await assert.rejects(
    service.startAuthenticatedAnalysisJob("user-1", {
      radarJobId: "job-missing",
      turnstileToken: "token",
    }),
    /Vaga não encontrada/,
  );
});

test("startAuthenticatedAnalysisJob throws BadRequestException when the radar job is not active", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      job: {
        findUnique: async () => ({
          id: "job-inactive",
          status: "closed",
          descriptionClean:
            "Descricao valida e longa o suficiente para passar na validacao de tamanho.",
        }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    { precheckTurnstile: async () => ({ ok: true }) },
  );

  await assert.rejects(
    service.startAuthenticatedAnalysisJob("user-1", {
      radarJobId: "job-inactive",
      turnstileToken: "token",
    }),
    /não está mais disponível/,
  );
});

test("startAuthenticatedAnalysisJob throws BadRequestException when descriptionClean is empty", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      job: {
        findUnique: async () => ({
          id: "job-empty-desc",
          status: "active",
          descriptionClean: "",
        }),
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    { precheckTurnstile: async () => ({ ok: true }) },
  );

  await assert.rejects(
    service.startAuthenticatedAnalysisJob("user-1", {
      radarJobId: "job-empty-desc",
      turnstileToken: "token",
    }),
    /não tem descrição suficiente/,
  );
});

test("startAuthenticatedAnalysisJob prefers jobDescriptionText for the analysis TEXT, but still resolves jobTitle/companyName from radarJobId — regression: the 1-click radar flow always sends both together (jobId auto-fills the textarea, see jobIdParam in adaptar-client.tsx), so ignoring radarJobId here meant every radar-originated candidatura was saved with companyName 'Não informado' even though the Job had a real company", async () => {
  let createdJob: Record<string, unknown> | null = null;
  let jobLookupCalled = false;
  let processAnalysisJobRadarFallback: unknown;

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => ({ rawText: "CV base" }) },
      analysisJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdJob = { id: "job-radar-2", ...data };
          return createdJob;
        },
        update: async (args: { data: Record<string, unknown> }) => args,
      },
      job: {
        findUnique: async () => {
          jobLookupCalled = true;
          return {
            id: "job-should-still-be-looked-up",
            status: "active",
            title: "Analista de Dados Sênior",
            descriptionClean: "descricao antiga da vaga, nao deve ser usada",
            company: { name: "Empresa Real Ltda" },
          };
        },
      },
    },
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyze: async () => {
        throw new Error("not exercised in this test");
      },
    },
  );

  // Intercepta processAnalysisJob (fire-and-forget) só pra capturar o
  // radarFallback com que startAuthenticatedAnalysisJob o chama — sem
  // isso não daria pra observar jobTitle/companyName resolvidos daqui.
  (
    service as unknown as {
      processAnalysisJob: (
        jobId: string,
        run: unknown,
        meta: unknown,
        radarFallback: unknown,
      ) => Promise<void>;
    }
  ).processAnalysisJob = async (_jobId, _run, _meta, radarFallback) => {
    processAnalysisJobRadarFallback = radarFallback;
  };

  const started = await service.startAuthenticatedAnalysisJob("user-1", {
    ...makeAnalyzeDto(),
    radarJobId: "job-should-still-be-looked-up",
  });

  assert.equal(started.status, "pending");
  assert.equal(jobLookupCalled, true);
  assert.equal(
    (createdJob as Record<string, unknown> | null)?.jobDescriptionText,
    makeAnalyzeDto().jobDescriptionText,
  );
  assert.deepEqual(processAnalysisJobRadarFallback, {
    jobTitle: "Analista de Dados Sênior",
    companyName: "Empresa Real Ltda",
  });
});

test("startAuthenticatedAnalysisJob throws BadRequestException when neither jobDescriptionText nor radarJobId are provided", async () => {
  const service = new CvAdaptationServiceCtor(
    {},
    {
      analyzeAndAdapt: async () => {},
      analyzeAndAdaptDirect: async () => {
        throw new Error("not used in this flow");
      },
      buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
    },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    { precheckTurnstile: async () => ({ ok: true }) },
  );

  await assert.rejects(
    service.startAuthenticatedAnalysisJob("user-1", {
      masterResumeId: "resume-1",
      turnstileToken: "token",
    }),
    /descrição da vaga ou um radarJobId/,
  );
});

test("getAnalysisJobStatus returns the job for its guest session owner", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          id: "job-1",
          status: "succeeded",
          userId: null,
          guestSessionHash: createHash("sha256")
            .update("guest-token-abc")
            .digest("hex"),
          lastError: null,
          adaptedContentJson: { ok: true },
          previewText: "preview",
          masterCvText: "cv text",
          analysisCvSnapshotId: "snapshot-1",
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  const result = await service.getAnalysisJobStatus("job-1", {
    userId: null,
    sessionPublicToken: "guest-token-abc",
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.previewText, "preview");
  assert.equal(result.analysisCvSnapshotId, "snapshot-1");
});

test("getAnalysisJobStatus exposes jobTitle/companyName (radar-curated, set by processAnalysisJob's radarFallback) — without this, callers only see adaptedContentJson.vaga which the AI frequently leaves empty", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          id: "job-radar-status-1",
          status: "succeeded",
          userId: "user-1",
          guestSessionHash: null,
          lastError: null,
          adaptedContentJson: { vaga: {} },
          previewText: "preview",
          masterCvText: "cv text",
          analysisCvSnapshotId: "snapshot-1",
          jobTitle: "Analista de Dados",
          companyName: "EarlyCV",
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  const result = await service.getAnalysisJobStatus("job-radar-status-1", {
    userId: "user-1",
    sessionPublicToken: null,
  });

  assert.equal(result.jobTitle, "Analista de Dados");
  assert.equal(result.companyName, "EarlyCV");
});

test("getAnalysisJobStatus does not leak jobTitle/companyName before the job succeeds", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          id: "job-pending-1",
          status: "processing",
          userId: "user-1",
          guestSessionHash: null,
          lastError: null,
          adaptedContentJson: null,
          previewText: null,
          masterCvText: null,
          analysisCvSnapshotId: null,
          jobTitle: "Analista de Dados",
          companyName: "EarlyCV",
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  const result = await service.getAnalysisJobStatus("job-pending-1", {
    userId: "user-1",
    sessionPublicToken: null,
  });

  assert.equal(result.jobTitle, null);
  assert.equal(result.companyName, null);
});

test("getAnalysisJobStatus hides the job from a different guest session", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          id: "job-1",
          status: "succeeded",
          userId: null,
          guestSessionHash: createHash("sha256")
            .update("guest-token-abc")
            .digest("hex"),
          lastError: null,
          adaptedContentJson: { ok: true },
          previewText: "preview",
          masterCvText: "cv text",
          analysisCvSnapshotId: "snapshot-1",
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  await assert.rejects(
    () =>
      service.getAnalysisJobStatus("job-1", {
        userId: null,
        sessionPublicToken: "someone-elses-token",
      }),
    /not found/i,
  );
});

test("getAnalysisJobStatus scopes authenticated jobs to their owner", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          id: "job-2",
          status: "processing",
          userId: "user-1",
          guestSessionHash: null,
          lastError: null,
          adaptedContentJson: null,
          previewText: null,
          masterCvText: null,
          analysisCvSnapshotId: null,
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  const ownResult = await service.getAnalysisJobStatus("job-2", {
    userId: "user-1",
    sessionPublicToken: null,
  });
  assert.equal(ownResult.status, "processing");

  await assert.rejects(
    () =>
      service.getAnalysisJobStatus("job-2", {
        userId: "user-2",
        sessionPublicToken: null,
      }),
    /not found/i,
  );
});

test("markAnalysisJobConverted links the job to the new account and CvAdaptation, without overwriting an already-converted job", async () => {
  const updateManyCalls: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [];

  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        updateMany: async (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          updateManyCalls.push(args);
          return { count: 1 };
        },
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  await (
    service as unknown as {
      markAnalysisJobConverted: (
        snapshotId: string | null | undefined,
        userId: string,
        cvAdaptationId: string,
      ) => Promise<void>;
    }
  ).markAnalysisJobConverted("snapshot-1", "user-9", "adapt-9");

  assert.equal(updateManyCalls.length, 1);
  assert.deepEqual(updateManyCalls[0]?.where, {
    analysisCvSnapshotId: "snapshot-1",
    convertedAt: null,
  });
  assert.equal(updateManyCalls[0]?.data.convertedCvAdaptationId, "adapt-9");
  assert.equal(updateManyCalls[0]?.data.userId, "user-9");
  assert.ok(updateManyCalls[0]?.data.convertedAt instanceof Date);
});

test("markAnalysisJobConverted is a no-op without a snapshot id", async () => {
  let called = false;
  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        updateMany: async () => {
          called = true;
          return { count: 0 };
        },
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  await (
    service as unknown as {
      markAnalysisJobConverted: (
        snapshotId: string | null | undefined,
        userId: string,
        cvAdaptationId: string,
      ) => Promise<void>;
    }
  ).markAnalysisJobConverted(null, "user-9", "adapt-9");

  assert.equal(called, false);
});

// ─── Fase B.3: product_origin propagado a analysis_started/completed/failed ───

type RecordedFunnelEvent = {
  eventName: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

function makeFunnelEventsCapture() {
  const calls: RecordedFunnelEvent[] = [];
  const funnelEvents = {
    record: async (input: RecordedFunnelEvent) => {
      calls.push(input);
      return { event: {}, ingested: true };
    },
  };
  return { funnelEvents, calls };
}

type ProcessAnalysisJobFn = (
  jobId: string,
  run: () => Promise<{
    adaptedContentJson: unknown;
    previewText: string;
    masterCvText: string;
    analysisCvSnapshotId: string;
  }>,
  analytics: {
    context: Record<string, unknown>;
    mode: "guest" | "authenticated";
    cvSource: "master_cv" | "upload";
    productOrigin: "radar" | "direct" | "analysis";
  },
) => Promise<void>;

test("processAnalysisJob tags analysis_started and analysis_completed with product_origin=radar", async () => {
  const { funnelEvents, calls } = makeFunnelEventsCapture();
  const service = new CvAdaptationServiceCtor(
    { analysisJob: { update: async () => ({}) } },
    {},
    {},
    {},
    {},
    {},
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    funnelEvents,
  );

  await (
    service as unknown as { processAnalysisJob: ProcessAnalysisJobFn }
  ).processAnalysisJob(
    "job-radar-1",
    async () => ({
      adaptedContentJson: {},
      previewText: "preview",
      masterCvText: "cv",
      analysisCvSnapshotId: "snap-1",
    }),
    {
      context: { routeKey: "cv-adaptation/analyze" },
      mode: "authenticated",
      cvSource: "master_cv",
      productOrigin: "radar",
    },
  );

  const started = calls.find((c) => c.eventName === "analysis_started");
  const completed = calls.find((c) => c.eventName === "analysis_completed");
  assert.equal(started?.metadata?.product_origin, "radar");
  assert.equal(completed?.metadata?.product_origin, "radar");
  assert.equal(started?.idempotencyKey, "analysis_started:job-radar-1");
  assert.equal(completed?.idempotencyKey, "analysis_completed:job-radar-1");
});

test("processAnalysisJob tags analysis_failed with the same product_origin as analysis_started", async () => {
  const { funnelEvents, calls } = makeFunnelEventsCapture();
  const service = new CvAdaptationServiceCtor(
    { analysisJob: { update: async () => ({}) } },
    {},
    {},
    {},
    {},
    {},
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    funnelEvents,
  );

  await (
    service as unknown as { processAnalysisJob: ProcessAnalysisJobFn }
  ).processAnalysisJob(
    "job-direct-1",
    async () => {
      throw new Error("boom");
    },
    {
      context: { routeKey: "cv-adaptation/analyze-guest" },
      mode: "guest",
      cvSource: "upload",
      productOrigin: "direct",
    },
  );

  const failed = calls.find((c) => c.eventName === "analysis_failed");
  assert.equal(failed?.metadata?.product_origin, "direct");
  assert.equal(failed?.idempotencyKey, "analysis_failed:job-direct-1");
});

test("processAnalysisJob propaga visitor_id/sessionInternalId do context para analysis_started e analysis_completed", async () => {
  const { funnelEvents, calls } = makeFunnelEventsCapture();
  const service = new CvAdaptationServiceCtor(
    { analysisJob: { update: async () => ({}) } },
    {},
    {},
    {},
    {},
    {},
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    funnelEvents,
  );

  await (
    service as unknown as { processAnalysisJob: ProcessAnalysisJobFn }
  ).processAnalysisJob(
    "job-ctx-1",
    async () => ({
      adaptedContentJson: {},
      previewText: "preview",
      masterCvText: "cv",
      analysisCvSnapshotId: "snap-1",
    }),
    {
      context: {
        routeKey: "cv-adaptation/analyze",
        visitorId: "visitor-xyz",
        journeySessionInternalId: "journey-xyz",
      },
      mode: "authenticated",
      cvSource: "master_cv",
      productOrigin: "direct",
    },
  );

  const started = calls.find((c) => c.eventName === "analysis_started");
  const completed = calls.find((c) => c.eventName === "analysis_completed");
  assert.equal(started?.metadata?.visitor_id, "visitor-xyz");
  assert.equal(started?.metadata?.sessionInternalId, "journey-xyz");
  assert.equal(completed?.metadata?.visitor_id, "visitor-xyz");
  assert.equal(completed?.metadata?.sessionInternalId, "journey-xyz");
});

test("processAnalysisJob propaga visitor_id/sessionInternalId do context para analysis_failed", async () => {
  const { funnelEvents, calls } = makeFunnelEventsCapture();
  const service = new CvAdaptationServiceCtor(
    { analysisJob: { update: async () => ({}) } },
    {},
    {},
    {},
    {},
    {},
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    funnelEvents,
  );

  await (
    service as unknown as { processAnalysisJob: ProcessAnalysisJobFn }
  ).processAnalysisJob(
    "job-ctx-2",
    async () => {
      throw new Error("boom");
    },
    {
      context: {
        routeKey: "cv-adaptation/analyze-guest",
        visitorId: "visitor-fail",
        journeySessionInternalId: "journey-fail",
      },
      mode: "guest",
      cvSource: "upload",
      productOrigin: "direct",
    },
  );

  const failed = calls.find((c) => c.eventName === "analysis_failed");
  assert.equal(failed?.metadata?.visitor_id, "visitor-fail");
  assert.equal(failed?.metadata?.sessionInternalId, "journey-fail");
});

test("startGuestAnalysisJob resolves product_origin=radar only when radarJobId is passed", async () => {
  const { funnelEvents, calls } = makeFunnelEventsCapture();
  const jobs = new Map<string, Record<string, unknown>>();
  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const id = `job-${jobs.size + 1}`;
          const record = { id, ...data };
          jobs.set(id, record);
          return record;
        },
        update: async () => ({}),
      },
      resume: { findFirst: async () => null },
      job: { findUnique: async () => null },
    },
    {},
    {},
    {},
    {},
    {
      precheckTurnstile: async () => ({ ok: true }),
      executeProtectedAnalyzeAndPersist: async () => ({
        ok: true,
        cached: false,
        canonicalHash: "hash",
        result: undefined,
      }),
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    funnelEvents,
  );

  await service.startGuestAnalysisJob(
    "Vaga com descricao suficientemente longa para passar na validacao interna.",
    undefined,
    validMasterCvText,
    "token",
    undefined,
    "job-radar-9",
  );

  // processAnalysisJob roda fire-and-forget — aguarda o próximo tick.
  await sleep(20);

  const started = calls.find((c) => c.eventName === "analysis_started");
  assert.equal(started?.metadata?.product_origin, "radar");
});

// Fase 1 do gate de autenticação (guestPossessionToken): jobId (cuid)
// identifica a análise, mas nunca deve autenticar posse dela sozinho — só
// quem recebeu o token cru na resposta de analyze-guest consegue provar
// posse depois. Ver specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-ADENDO-hardening.md.

test("startGuestAnalysisJob generates a guestPossessionToken and persists only its SHA-256 hash", async () => {
  let createdData: Record<string, unknown> | null = null;

  const service = new CvAdaptationServiceCtor(
    {
      resume: { findFirst: async () => null },
      analysisCvSnapshot: { create: async () => ({ id: "snapshot-tok-1" }) },
      analysisJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData = data;
          return { id: "job-tok-1", ...data };
        },
        update: async (args: { data: Record<string, unknown> }) => args,
      },
    },
    { analyzeAndAdapt: async () => {} },
    {},
    {},
    {},
    { precheckTurnstile: async () => ({ ok: true }) },
  );

  const started = await service.startGuestAnalysisJob(
    "Vaga com descricao suficientemente longa para passar na validacao interna.",
    undefined,
    validMasterCvText,
    "token",
    undefined,
  );

  assert.equal(typeof started.guestPossessionToken, "string");
  // randomBytes(32).toString("hex") => 64 caracteres hex.
  assert.match(started.guestPossessionToken, /^[0-9a-f]{64}$/);

  const persistedHash = (createdData as Record<string, unknown> | null)
    ?.guestPossessionTokenHash as string;
  assert.equal(typeof persistedHash, "string");
  assert.notEqual(persistedHash, started.guestPossessionToken);
  assert.equal(
    persistedHash,
    createHash("sha256").update(started.guestPossessionToken).digest("hex"),
  );
});

test("verifyGuestPossessionToken succeeds when the raw token matches the stored hash", async () => {
  const rawToken = "a".repeat(64);
  const hash = createHash("sha256").update(rawToken).digest("hex");

  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === "job-ok"
            ? { ownerKind: "guest", guestPossessionTokenHash: hash }
            : null,
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  const ok = await service.verifyGuestPossessionToken("job-ok", rawToken);
  assert.equal(ok, true);
});

test("verifyGuestPossessionToken fails when the raw token does not match the stored hash", async () => {
  const hash = createHash("sha256").update("correct-token").digest("hex");

  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          ownerKind: "guest",
          guestPossessionTokenHash: hash,
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  const ok = await service.verifyGuestPossessionToken("job-1", "wrong-token");
  assert.equal(ok, false);
});

test("verifyGuestPossessionToken fails when only jobId is known and no token is presented — jobId alone is not ownership", async () => {
  const hash = createHash("sha256").update("real-token").digest("hex");

  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          ownerKind: "guest",
          guestPossessionTokenHash: hash,
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  // Sem token nenhum (string vazia) — só o jobId não é suficiente.
  const ok = await service.verifyGuestPossessionToken("job-1", "");
  assert.equal(ok, false);
});

test("verifyGuestPossessionToken fails for a job that never had a possession token issued (e.g. authenticated job)", async () => {
  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          ownerKind: "authenticated",
          guestPossessionTokenHash: null,
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  const ok = await service.verifyGuestPossessionToken(
    "job-authenticated-1",
    "any-token",
  );
  assert.equal(ok, false);
});

test("verifyGuestPossessionToken fails when the job does not exist", async () => {
  const service = new CvAdaptationServiceCtor(
    { analysisJob: { findUnique: async () => null } },
    {},
    {},
    {},
    {},
    {},
  );

  const ok = await service.verifyGuestPossessionToken(
    "job-does-not-exist",
    "any-token",
  );
  assert.equal(ok, false);
});

// Fase 2: getGuestAnalysisJobStatusOnly — o único método que a rota pública
// de polling deve chamar quando guest_analysis_auth_gate_enabled está ligado
// e a requisição não está autenticada. Nunca deve devolver conteúdo, e
// nunca deve depender só do jobId para "provar" posse.

test("getGuestAnalysisJobStatusOnly returns only { status } for a valid possession token, never content", async () => {
  const rawToken = "b".repeat(64);
  const hash = createHash("sha256").update(rawToken).digest("hex");
  let callCount = 0;

  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        // Primeira chamada (dentro de verifyGuestPossessionToken) só
        // precisa do hash; a segunda (leitura do status em si) simula um
        // select real, que nunca traria adaptedContentJson/previewText/etc.
        findUnique: async () => {
          callCount += 1;
          if (callCount === 1) {
            return { ownerKind: "guest", guestPossessionTokenHash: hash };
          }
          return { status: "succeeded" };
        },
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  const result = await service.getGuestAnalysisJobStatusOnly(
    "job-guest-1",
    rawToken,
  );

  assert.deepEqual(result, { status: "succeeded" });
  assert.equal(
    (result as Record<string, unknown>).adaptedContentJson,
    undefined,
  );
  assert.equal((result as Record<string, unknown>).previewText, undefined);
  assert.equal((result as Record<string, unknown>).masterCvText, undefined);
  assert.equal(
    (result as Record<string, unknown>).analysisCvSnapshotId,
    undefined,
  );
  assert.equal((result as Record<string, unknown>).jobTitle, undefined);
  assert.equal((result as Record<string, unknown>).companyName, undefined);
});

test("getGuestAnalysisJobStatusOnly throws NotFoundException when no possession token is presented", async () => {
  const service = new CvAdaptationServiceCtor(
    { analysisJob: { findUnique: async () => null } },
    {},
    {},
    {},
    {},
    {},
  );

  await assert.rejects(
    () => service.getGuestAnalysisJobStatusOnly("job-guest-1", null),
    /analysis job not found/,
  );
});

test("getGuestAnalysisJobStatusOnly throws NotFoundException for a wrong possession token — jobId alone never grants access", async () => {
  const hash = createHash("sha256").update("correct-token").digest("hex");

  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async () => ({
          ownerKind: "guest",
          guestPossessionTokenHash: hash,
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  await assert.rejects(
    () => service.getGuestAnalysisJobStatusOnly("job-guest-1", "wrong-token"),
    /analysis job not found/,
  );
});

test("getGuestAnalysisJobStatusOnly throws NotFoundException when the token belongs to a different job (cross-job ownership must never work)", async () => {
  const rawToken = "c".repeat(64);

  const service = new CvAdaptationServiceCtor(
    {
      analysisJob: {
        findUnique: async ({ where }: { where: { id?: string } }) => {
          if (where.id === "job-b") {
            // job-b tem um hash diferente — o token do guest é válido só
            // para job-a, nunca para job-b.
            return {
              ownerKind: "guest",
              guestPossessionTokenHash: createHash("sha256")
                .update("token-for-job-b")
                .digest("hex"),
            };
          }
          return null;
        },
      },
    },
    {},
    {},
    {},
    {},
    {},
  );

  await assert.rejects(
    () => service.getGuestAnalysisJobStatusOnly("job-b", rawToken),
    /analysis job not found/,
  );
});

// Fase 4: claimGuestAnalysisJob — claim server-side sem reprocessar IA. O
// conteúdo vem estritamente do AnalysisJob já processado, nunca de um
// payload externo; ownership é job.userId === userId (já transferida em
// transferAnalysisJobOwnership); idempotente para callback repetido, claim
// repetido e tentativa concorrente.

const baseSucceededJob = () => ({
  id: "job-succeeded-1",
  userId: "user-1",
  ownerKind: "guest",
  status: "succeeded",
  convertedAt: null,
  convertedCvAdaptationId: null,
  analysisCvSnapshotId: "snapshot-1",
  adaptedContentJson: { fit: { score: 88 }, vaga: { cargo: "Analista" } },
  previewText: "preview do backend",
  masterCvText: "CV completo extraído pelo backend",
  jobDescriptionText:
    "Vaga com descricao suficientemente longa para passar na validacao interna.",
  jobTitle: "Analista de Dados",
  companyName: "EarlyCV",
});

function makeClaimServiceMocks(job: ReturnType<typeof baseSucceededJob>) {
  const capturedCvAdaptationCreateData: Array<Record<string, unknown>> = [];

  const database = {
    resumeTemplate: { findFirst: async () => null },
    resume: {
      findFirst: async ({ where }: { where: { kind?: string } }) => {
        if (where.kind === "master") return null;
        return { id: "adapted-resume-1" };
      },
      create: async () => ({ id: "new-master-1" }),
    },
    cvAdaptation: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        capturedCvAdaptationCreateData.push(data);
        return {
          id: "cv-adaptation-claimed-1",
          isUnlocked: false,
          paidAt: null,
          paymentStatus: "none",
          unlockedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
      },
    },
    analysisCvSnapshot: {
      findUnique: async () => ({
        id: job.analysisCvSnapshotId,
        userId: null,
        guestSessionHash: null,
        expiresAt: null,
        claimedAt: null,
        claimedByUserId: null,
      }),
      update: async () => ({
        id: job.analysisCvSnapshotId,
        originalFileName: null,
      }),
    },
    analysisJob: {
      findUnique: async () => ({ ...job }),
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          analysisCvSnapshotId?: string;
          convertedAt?: null;
          id?: string;
          ownerKind?: string;
          OR?: Array<{ userId: string | null }>;
        };
        data: Record<string, unknown>;
      }) => {
        if (where.id !== undefined) {
          // Formato da transferência de ownership por possession token
          // (claimGuestAnalysisJob) — job.id + guard de dono atual.
          const currentUserId = (job as { userId?: string | null }).userId;
          const matches =
            where.id === job.id &&
            where.ownerKind === job.ownerKind &&
            (where.OR ?? []).some((clause) => clause.userId === currentUserId);
          if (matches) {
            Object.assign(job, data);
            return { count: 1 };
          }
          return { count: 0 };
        }

        if (
          where.analysisCvSnapshotId === job.analysisCvSnapshotId &&
          job.convertedAt === null
        ) {
          Object.assign(job, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };

  const aiService = {
    analyzeAndAdapt: async () => {},
    analyzeAndAdaptDirect: async () => {
      throw new Error("claimGuestAnalysisJob must never call AI");
    },
    buildPaidCvOutputFromGuest: async () => ({ summary: "", sections: [] }),
  };

  const protectedAnalyzeService = {
    executeProtectedAnalyze: async () => {
      throw new Error(
        "claimGuestAnalysisJob must never call the AI provider gateway",
      );
    },
  };

  const service = new CvAdaptationServiceCtor(
    database,
    aiService,
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    protectedAnalyzeService,
  );

  return { service, capturedCvAdaptationCreateData, database };
}

test("claimGuestAnalysisJob rejects when the job does not belong to the caller — jobId alone never grants access", async () => {
  const job = baseSucceededJob();
  const { service } = makeClaimServiceMocks(job);

  await assert.rejects(
    () => service.claimGuestAnalysisJob("someone-else", job.id),
    /analysis job not found/,
  );
});

test("claimGuestAnalysisJob rejects when the job does not exist", async () => {
  const service = new CvAdaptationServiceCtor(
    { analysisJob: { findUnique: async () => null } },
    {},
    {},
    {},
    {},
    {},
  );

  await assert.rejects(
    () => service.claimGuestAnalysisJob("user-1", "job-missing"),
    /analysis job not found/,
  );
});

test("claimGuestAnalysisJob returns { status } without materializing anything while the job is still processing", async () => {
  const job = { ...baseSucceededJob(), status: "processing" };
  const { service, capturedCvAdaptationCreateData } =
    makeClaimServiceMocks(job);

  const result = await service.claimGuestAnalysisJob("user-1", job.id);

  assert.deepEqual(result, { status: "processing" });
  assert.equal(capturedCvAdaptationCreateData.length, 0);
});

test("claimGuestAnalysisJob returns { status: 'failed' } for a failed job, no materialization", async () => {
  const job = { ...baseSucceededJob(), status: "failed" };
  const { service, capturedCvAdaptationCreateData } =
    makeClaimServiceMocks(job);

  const result = await service.claimGuestAnalysisJob("user-1", job.id);

  assert.deepEqual(result, { status: "failed" });
  assert.equal(capturedCvAdaptationCreateData.length, 0);
});

test("claimGuestAnalysisJob materializes CvAdaptation strictly from AnalysisJob content (own DB row, never an external payload) — and never calls AI", async () => {
  const job = baseSucceededJob();
  const { service, capturedCvAdaptationCreateData } =
    makeClaimServiceMocks(job);

  const result = await service.claimGuestAnalysisJob("user-1", job.id);

  assert.equal(result.status, "succeeded");
  assert.equal(
    (result as { cvAdaptationId: string }).cvAdaptationId,
    "cv-adaptation-claimed-1",
  );

  assert.equal(capturedCvAdaptationCreateData.length, 1);
  const created = capturedCvAdaptationCreateData[0];
  // adaptedContentJson.vaga é reconciliado com job.jobTitle/companyName
  // (o próprio AnalysisJob, nunca payload externo) — ver
  // reconcileVagaFields. job.adaptedContentJson.vaga.cargo="Analista"
  // (sem empresa) é deliberadamente o fixture do bug real: a IA errou
  // cargo/empresa, mas o job já sabia os dois certos.
  assert.deepEqual(created.adaptedContentJson, {
    ...job.adaptedContentJson,
    vaga: { cargo: job.jobTitle, empresa: job.companyName },
  });
  assert.equal(created.previewText, job.previewText);
  assert.equal(created.jobDescriptionText, job.jobDescriptionText);
  assert.equal(created.jobTitle, job.jobTitle);
  assert.equal(created.companyName, job.companyName);
  // Critério crítico: continua vinculada ao analysisCvSnapshotId — é essa
  // vinculação que exclui o snapshot do cleanup de 30 dias.
  assert.equal(created.analysisCvSnapshotId, job.analysisCvSnapshotId);
});

test("claimGuestAnalysisJob throws when a succeeded job is missing its snapshot reference", async () => {
  const job = { ...baseSucceededJob(), analysisCvSnapshotId: null };
  const { service } = makeClaimServiceMocks(job as never);

  await assert.rejects(
    () => service.claimGuestAnalysisJob("user-1", job.id),
    /missing its snapshot reference/,
  );
});

test("claimGuestAnalysisJob is idempotent — a repeated call after conversion returns the cached result without creating a second CvAdaptation (callback duplicado / claim repetido)", async () => {
  const job = baseSucceededJob();
  const { service, capturedCvAdaptationCreateData } =
    makeClaimServiceMocks(job);

  const first = await service.claimGuestAnalysisJob("user-1", job.id);
  const second = await service.claimGuestAnalysisJob("user-1", job.id);

  assert.deepEqual(first, second);
  assert.equal(capturedCvAdaptationCreateData.length, 1);
});

// Caminho de login/cadastro por email (ao contrário do Google OAuth, que
// já transfere ownership via transferAnalysisJobOwnership antes de chegar
// aqui): o job guest ainda está com userId null quando claimAnalysisJob é
// chamado — só o guestPossessionToken prova a posse e libera a
// transferência. Sem essa prova, jobId sozinho nunca basta (mesmo
// princípio do teste "jobId alone never grants access" acima).
const GUEST_POSSESSION_RAW_TOKEN = "d".repeat(64);

function baseUnclaimedGuestJob() {
  return {
    ...baseSucceededJob(),
    userId: null,
    guestPossessionTokenHash: createHash("sha256")
      .update(GUEST_POSSESSION_RAW_TOKEN)
      .digest("hex"),
  };
}

test("claimGuestAnalysisJob transfers ownership via guestPossessionToken when the job is still guest-owned (email login/register)", async () => {
  const job = baseUnclaimedGuestJob();
  const { service, capturedCvAdaptationCreateData } = makeClaimServiceMocks(
    job as never,
  );

  const result = await service.claimGuestAnalysisJob(
    "user-1",
    job.id,
    GUEST_POSSESSION_RAW_TOKEN,
  );

  assert.equal(result.status, "succeeded");
  assert.equal(job.userId, "user-1");
  assert.equal(capturedCvAdaptationCreateData.length, 1);
});

test("claimGuestAnalysisJob rejects an unclaimed guest job when no guestPossessionToken is sent", async () => {
  const job = baseUnclaimedGuestJob();
  const { service, capturedCvAdaptationCreateData } = makeClaimServiceMocks(
    job as never,
  );

  await assert.rejects(
    () => service.claimGuestAnalysisJob("user-1", job.id),
    /analysis job not found/,
  );
  assert.equal(job.userId, null);
  assert.equal(capturedCvAdaptationCreateData.length, 0);
});

test("claimGuestAnalysisJob rejects an unclaimed guest job when guestPossessionToken doesn't match", async () => {
  const job = baseUnclaimedGuestJob();
  const { service, capturedCvAdaptationCreateData } = makeClaimServiceMocks(
    job as never,
  );

  await assert.rejects(
    () =>
      service.claimGuestAnalysisJob("user-1", job.id, "wrong-token".repeat(8)),
    /analysis job not found/,
  );
  assert.equal(job.userId, null);
  assert.equal(capturedCvAdaptationCreateData.length, 0);
});

test("claimGuestAnalysisJob never lets guestPossessionToken override a job already owned by someone else", async () => {
  const job = { ...baseSucceededJob(), userId: "someone-else" };
  const { service, capturedCvAdaptationCreateData } = makeClaimServiceMocks(
    job as never,
  );

  await assert.rejects(
    () =>
      service.claimGuestAnalysisJob(
        "user-1",
        job.id,
        GUEST_POSSESSION_RAW_TOKEN,
      ),
    /analysis job not found/,
  );
  assert.equal(job.userId, "someone-else");
  assert.equal(capturedCvAdaptationCreateData.length, 0);
});

// Nota sobre concorrência real: um teste unitário com mocks síncronos não
// prova nada sobre duas requisições HTTP verdadeiramente concorrentes —
// mocks resolvem de forma determinística no event loop, sem a latência
// real de I/O que cria a janela de corrida. A proteção estrutural real
// contra duas CvAdaptation duplicadas para o mesmo snapshot é a constraint
// `@unique` em `CvAdaptation.analysisCvSnapshotId` (schema.prisma, já
// existente, não alterada por esta fase) — o Postgres rejeita a segunda
// inserção concorrente com um erro de constraint, não duplica
// silenciosamente. Um teste e2e com duas requisições HTTP reais em paralelo
// contra o Postgres de teste cobre isso em cv-adaptation.e2e-spec.ts.
