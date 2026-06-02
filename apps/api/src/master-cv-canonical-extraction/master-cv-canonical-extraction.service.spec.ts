import assert from "node:assert/strict";
import { test } from "node:test";

import { MasterCvCanonicalExtractionService } from "./master-cv-canonical-extraction.service";
import { MasterCvCanonicalExtractionWorker } from "./master-cv-canonical-extraction.worker";

function buildExtractionOutput() {
  return {
    canonicalProfile: {
      fullName: "Ana Souza",
      headline: "Data Analyst",
      email: "ana@example.com",
      phone: "+55 11 99999-0000",
      linkedinUrl: "https://linkedin.com/in/ana-souza",
      location: {
        city: "Sao Paulo",
        state: "SP",
        country: "BR",
      },
      professionalSummary: "Resumo profissional",
      experiences: [],
      education: [],
      skills: {
        technical: ["SQL"],
        business: [],
        soft: ["Comunicacao"],
      },
      languages: [{ language: "Portugues", level: "Nativo" }],
      certifications: [{ name: "Cert", issuer: null, year: null }],
    },
    extractionCoverage: {
      identifiedFields: ["fullName", "skills.technical"],
      missingFields: [],
      fieldStatus: {
        fullName: "filled",
        "skills.technical": "filled",
      },
    },
    confidence: {
      fullName: 0.98,
    },
    evidence: {
      fullName: ["Ana Souza"],
    },
  };
}

test("processJob marks extraction as failed when payload validation fails", async () => {
  const updates: Array<unknown> = [];
  let mergeCalled = false;

  const service = new MasterCvCanonicalExtractionService(
    {
      masterCvCanonicalExtraction: {
        findUnique: async () => ({
          id: "ext-2",
          userId: "user-1",
          resumeId: "resume-1",
          status: "pending",
        }),
        update: async (args: unknown) => {
          updates.push(args);
          return args;
        },
      },
      userProfile: {
        findUnique: async () => ({ userId: "user-1" }),
        update: async () => ({}),
      },
    } as never,
    {
      merge: () => {
        mergeCalled = true;
        return {};
      },
    } as never,
    {
      compute: () => "partial",
    } as never,
    {} as never,
    {
      extract: async () =>
        ({
          canonicalProfile: {},
          extractionCoverage: {
            identifiedFields: [],
            missingFields: [],
            fieldStatus: { fullName: "wrong" },
          },
          confidence: {},
          evidence: {},
        }) as never,
    },
  );

  await assert.rejects(
    () => service.processJob({ extractionId: "ext-2" }),
    /invalid/i,
  );

  assert.equal(mergeCalled, false);
  const failedUpdate = updates.find(
    (entry) =>
      (entry as { data?: { status?: string } }).data?.status === "failed",
  );
  assert.equal(Boolean(failedUpdate), true);
});

test("processJob marks extraction as failed on strict schema mismatch", async () => {
  const updates: Array<unknown> = [];

  const service = new MasterCvCanonicalExtractionService(
    {
      masterCvCanonicalExtraction: {
        findUnique: async () => ({
          id: "ext-2b",
          userId: "user-1",
          resumeId: "resume-1",
          status: "pending",
          resume: { rawText: "texto do cv" },
        }),
        update: async (args: unknown) => {
          updates.push(args);
          return args;
        },
      },
      userProfile: {
        findUnique: async () => ({ userId: "user-1" }),
        update: async () => ({}),
      },
    } as never,
    {
      merge: () => ({}),
    } as never,
    {
      compute: () => "partial",
    } as never,
    {} as never,
    {
      extract: async () =>
        ({
          canonicalProfile: {
            fullName: null,
            headline: null,
            email: null,
            phone: null,
            linkedinUrl: null,
            location: { city: null, state: null, country: null },
            professionalSummary: null,
            experiences: [],
            education: [],
            skills: { technical: [], business: [], soft: [] },
            languages: [],
            certifications: [],
          },
          extractionCoverage: {
            identifiedFields: [],
            missingFields: [],
            fieldStatus: {},
          },
          confidence: { fullName: "0.9" },
          evidence: {},
        }) as never,
    },
  );

  await assert.rejects(
    () => service.processJob({ extractionId: "ext-2b" }),
    /confidence\.fullName/i,
  );

  const failedUpdate = updates.find(
    (entry) =>
      (entry as { data?: { status?: string } }).data?.status === "failed",
  );
  assert.equal(Boolean(failedUpdate), true);
});

test("processJob marks extraction as failed when confidence is out of range", async () => {
  const updates: Array<unknown> = [];

  const service = new MasterCvCanonicalExtractionService(
    {
      masterCvCanonicalExtraction: {
        findUnique: async () => ({
          id: "ext-2c",
          userId: "user-1",
          resumeId: "resume-1",
          status: "pending",
          resume: { rawText: "texto do cv" },
        }),
        update: async (args: unknown) => {
          updates.push(args);
          return args;
        },
      },
      userProfile: {
        findUnique: async () => ({ userId: "user-1" }),
        update: async () => ({}),
      },
    } as never,
    {
      merge: () => ({}),
    } as never,
    {
      compute: () => "partial",
    } as never,
    {} as never,
    {
      extract: async () => ({
        ...buildExtractionOutput(),
        confidence: { fullName: 1.4 },
      }),
    },
  );

  await assert.rejects(
    () => service.processJob({ extractionId: "ext-2c" }),
    /confidence\.fullName/i,
  );

  const failedUpdate = updates.find(
    (entry) =>
      (entry as { data?: { status?: string } }).data?.status === "failed",
  );
  assert.equal(Boolean(failedUpdate), true);
});

test("mapped experience and education ids are stable across reorder", async () => {
  const payloadA = buildExtractionOutput();
  payloadA.canonicalProfile.experiences = [
    {
      role: "Analyst",
      company: "Acme",
      location: null,
      startDate: "2023-01",
      endDate: null,
      bullets: ["A"],
      technologies: ["SQL"],
    },
    {
      role: "Engineer",
      company: "Beta",
      location: null,
      startDate: "2022-01",
      endDate: "2022-12",
      bullets: ["B"],
      technologies: ["TS"],
    },
  ];
  payloadA.canonicalProfile.education = [
    {
      institution: "USP",
      degree: "BSc",
      fieldOfStudy: "CS",
      startDate: "2018",
      endDate: "2021",
    },
    {
      institution: "FGV",
      degree: "MBA",
      fieldOfStudy: "Data",
      startDate: "2022",
      endDate: "2023",
    },
  ];

  const payloadB = buildExtractionOutput();
  payloadB.canonicalProfile.experiences = [
    ...payloadA.canonicalProfile.experiences,
  ].reverse();
  payloadB.canonicalProfile.education = [
    ...payloadA.canonicalProfile.education,
  ].reverse();

  const captureIds = async (
    payload: ReturnType<typeof buildExtractionOutput>,
  ) => {
    let capturedExperienceIds: string[] = [];
    let capturedEducationIds: string[] = [];
    const service = new MasterCvCanonicalExtractionService(
      {
        masterCvCanonicalExtraction: {
          findUnique: async () => ({
            id: "ext-stable",
            userId: "user-1",
            resumeId: "resume-1",
            status: "pending",
            resume: { rawText: "texto do cv" },
          }),
          update: async (args: unknown) => args,
        },
        userProfile: {
          findUnique: async () => ({
            userId: "user-1",
            fullName: null,
            headline: null,
            linkedinUrl: null,
            phone: null,
            professionalSummary: null,
            city: null,
            state: null,
            country: null,
            experiencesJson: [],
            educationJson: [],
            skillsJson: { technical: [], business: [], soft: [] },
            profileFieldMetaJson: {},
            profileSuggestionsJson: [],
          }),
          update: async () => ({}),
        },
      } as never,
      {
        merge: (input: {
          incoming: {
            experiences?: Array<{ id: string }>;
            education?: Array<{ id: string }>;
          };
        }) => {
          capturedExperienceIds = (input.incoming.experiences ?? []).map(
            (item) => item.id,
          );
          capturedEducationIds = (input.incoming.education ?? []).map(
            (item) => item.id,
          );
          return {
            next: {
              experiences: [],
              education: [],
              skills: { technical: [], business: [], soft: [] },
            },
            fieldMeta: {},
            suggestions: [],
          };
        },
      } as never,
      {
        compute: () => "partial",
      } as never,
      {} as never,
      {
        extract: async () => payload,
      },
    );

    await service.processJob({ extractionId: "ext-stable" });
    return {
      experiences: capturedExperienceIds.slice().sort(),
      education: capturedEducationIds.slice().sort(),
    };
  };

  const first = await captureIds(payloadA);
  const second = await captureIds(payloadB);

  assert.deepEqual(first.experiences, second.experiences);
  assert.deepEqual(first.education, second.education);
});

test("processJob persists payload and merges canonical profile on success", async () => {
  const updates: Array<unknown> = [];
  const profileUpdates: Array<unknown> = [];
  const extractionOutput = buildExtractionOutput();
  let mergeSource: string | null = null;
  let mergeConfidence: Record<string, number> | null = null;
  let mergeExtractedAt: string | null = null;

  const service = new MasterCvCanonicalExtractionService(
    {
      masterCvCanonicalExtraction: {
        findUnique: async () => ({
          id: "ext-3",
          userId: "user-1",
          resumeId: "resume-1",
          status: "pending",
          resume: { rawText: "texto do cv" },
        }),
        update: async (args: unknown) => {
          updates.push(args);
          return args;
        },
      },
      userProfile: {
        findUnique: async () => ({
          userId: "user-1",
          fullName: null,
          headline: null,
          linkedinUrl: null,
          phone: null,
          professionalSummary: null,
          city: null,
          state: null,
          country: null,
          experiencesJson: [],
          educationJson: [],
          skillsJson: { technical: [], business: [], soft: [] },
          profileFieldMetaJson: {},
          profileSuggestionsJson: [],
        }),
        update: async (args: unknown) => {
          profileUpdates.push(args);
          return args;
        },
      },
    } as never,
    {
      merge: (input: {
        source: string;
        extractionContext?: {
          confidence?: Record<string, number>;
          extractedAt?: string;
        };
      }) => {
        mergeSource = input.source;
        mergeConfidence = input.extractionContext?.confidence ?? null;
        mergeExtractedAt = input.extractionContext?.extractedAt ?? null;
        return {
          next: {
            fullName: "Ana Souza",
            experiences: [],
            education: [],
            skills: { technical: ["SQL"], business: [], soft: [] },
          },
          fieldMeta: { fullName: { source: "base_cv_upload" } },
          suggestions: [],
        };
      },
    } as never,
    {
      compute: () => "ready",
    } as never,
    {} as never,
    {
      extract: async () => extractionOutput,
    } as never,
  );

  await service.processJob({ extractionId: "ext-3" });

  const succeededUpdate = updates.find(
    (entry) =>
      (entry as { data?: { status?: string } }).data?.status === "succeeded",
  ) as { data: { canonicalJson: unknown; coverageJson: unknown } };

  assert.deepEqual(
    succeededUpdate.data.canonicalJson,
    extractionOutput.canonicalProfile,
  );
  assert.deepEqual(
    succeededUpdate.data.coverageJson,
    extractionOutput.extractionCoverage,
  );
  assert.equal(mergeSource, "base_cv_ai_extraction");
  assert.deepEqual(mergeConfidence, extractionOutput.confidence);
  assert.equal(Boolean(mergeExtractedAt), true);
  assert.equal(profileUpdates.length, 1);
});

test("processJob uses the raw file payload when one is supplied", async () => {
  const updates: Array<unknown> = [];
  const extractionOutput = buildExtractionOutput();
  let receivedFile: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  } | null = null;

  const service = new MasterCvCanonicalExtractionService(
    {
      masterCvCanonicalExtraction: {
        findUnique: async () => ({
          id: "ext-file",
          userId: "user-1",
          resumeId: "resume-1",
          status: "pending",
          resume: { rawText: "texto do cv" },
        }),
        update: async (args: unknown) => {
          updates.push(args);
          return args;
        },
      },
      userProfile: {
        findUnique: async () => ({
          userId: "user-1",
          fullName: null,
          headline: null,
          linkedinUrl: null,
          phone: null,
          professionalSummary: null,
          city: null,
          state: null,
          country: null,
          experiencesJson: [],
          educationJson: [],
          skillsJson: { technical: [], business: [], soft: [] },
          profileFieldMetaJson: {},
          profileSuggestionsJson: [],
        }),
        update: async () => ({}),
      },
    } as never,
    {
      merge: () => ({
        next: {
          fullName: "Ana Souza",
          experiences: [],
          education: [],
          skills: { technical: ["SQL"], business: [], soft: [] },
        },
        fieldMeta: { fullName: { source: "base_cv_ai_extraction" } },
        suggestions: [],
      }),
    } as never,
    {
      compute: () => "ready",
    } as never,
    {} as never,
    {
      extract: async (input: unknown) => {
        receivedFile = (input as { file?: typeof receivedFile }).file ?? null;
        return extractionOutput;
      },
    } as never,
  );

  await service.processJob({
    extractionId: "ext-file",
    file: {
      buffer: Buffer.from("%PDF-1.7 raw bytes"),
      originalname: "cv.pdf",
      mimetype: "application/pdf",
      size: 18,
    },
  });

  assert.equal(receivedFile?.originalname, "cv.pdf");
  assert.equal(receivedFile?.mimetype, "application/pdf");
  assert.equal(receivedFile?.size, 18);
  assert.equal(
    updates.some(
      (entry) =>
        (entry as { data?: { status?: string } }).data?.status === "succeeded",
    ),
    true,
  );
});

test("worker retries transient failures up to max attempts", async () => {
  let attempts = 0;
  const worker = new MasterCvCanonicalExtractionWorker({
    getById: async () => ({
      id: "ext-1",
      inputHash: "hash-1",
      resumeId: "resume-1",
      userId: "user-1",
    }),
    processJob: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("network timeout");
      }
      return null;
    },
  } as never);

  await worker.consume({ extractionId: "ext-1" });
  assert.equal(attempts, 3);
});

test("worker stops retrying for permanent failures", async () => {
  let attempts = 0;
  const worker = new MasterCvCanonicalExtractionWorker({
    getById: async () => ({
      id: "ext-2",
      inputHash: "hash-2",
      resumeId: "resume-2",
      userId: "user-2",
    }),
    processJob: async () => {
      attempts += 1;
      throw new Error("schema validation failed");
    },
  } as never);

  await assert.rejects(
    () => worker.consume({ extractionId: "ext-2" }),
    /schema/i,
  );
  assert.equal(attempts, 1);
});

test("worker logs resumeId userId and inputHash metadata", async () => {
  const logs: Array<{ message: string; payload?: unknown }> = [];
  const worker = new MasterCvCanonicalExtractionWorker({
    getById: async () => ({
      id: "ext-3",
      inputHash: "hash-3",
      resumeId: "resume-3",
      userId: "user-3",
    }),
    processJob: async () => null,
  } as never);

  (
    worker as unknown as {
      logger: {
        log: (message: string, payload?: unknown) => void;
        warn: (message: string, payload?: unknown) => void;
      };
    }
  ).logger = {
    log: (message: string, payload?: unknown) =>
      logs.push({ message, payload }),
    warn: (message: string, payload?: unknown) =>
      logs.push({ message, payload }),
  };

  await worker.consume({ extractionId: "ext-3" });

  const processingLog = logs.find((entry) =>
    entry.message.includes("processing master CV canonical extraction"),
  );
  assert.equal(Boolean(processingLog), true);
  assert.equal(
    (processingLog?.payload as { resumeId?: string }).resumeId,
    "resume-3",
  );
  assert.equal(
    (processingLog?.payload as { userId?: string }).userId,
    "user-3",
  );
  assert.equal(
    (processingLog?.payload as { inputHash?: string }).inputHash,
    "hash-3",
  );
});
