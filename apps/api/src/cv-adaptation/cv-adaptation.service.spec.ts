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
    "Resumo\nExperiencia\n2022\nSQL",
    "token",
  );

  assert.equal(result.masterCvText, "CV texto");
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
    masterCvText: "Resumo\nExperiencia\n2022\nSQL",
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
      executeProtectedBuildPaidCvOutputFromGuest: async () => {
        protectedCalls += 1;
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
  assert.equal(directCalls, 0);
  assert.equal(output.summary, "Resumo");
  assert.deepEqual(updates[0], {
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
    "Resumo\nExperiencia\n2022\nSQL",
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
    masterCvText: "\uFEFF  Linha 1\r\nLinha 2  ",
    saveAsMaster: false,
    turnstileToken: "token",
  });

  assert.equal(aiLoadedText, "Linha 1\nLinha 2");
  assert.equal(storedMarkdown, "Linha 1\nLinha 2");
  assert.equal(result.masterCvText, "Linha 1\nLinha 2");
  assert.equal(
    storedSha,
    createHash("sha256")
      .update(Buffer.from("Linha 1\nLinha 2", "utf8"))
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
