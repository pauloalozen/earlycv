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
    { resume: { findFirst: async () => null } },
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
    { resume: { findFirst: async () => null } },
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
            status: "awaiting_payment",
            template: null,
            templateId: data.templateId,
            updatedAt: now,
            userId: "user-1",
          };
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
    previewText: "preview",
  });

  assert.equal(createdMasterWithFlag, 0);
  assert.equal(createdResumeWithoutMasterFlag, 1);
  assert.equal(capturedMasterResumeId, "new-master-1");
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
