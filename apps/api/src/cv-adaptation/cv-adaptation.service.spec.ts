import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

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

test("saveGuestPreview does not auto-promote a resume to master when user did not request it", async () => {
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

  assert.equal(createdMasterWithFlag, 0);
  assert.equal(createdResumeWithoutMasterFlag, 1);
  assert.equal(capturedMasterResumeId, "new-master-1");
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
