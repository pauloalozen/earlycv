// Testes permanentes — seção 5 da 2ª rodada da auditoria adversarial
// (2026-09-08). Prova, com sentinelas ORIGEM_*, que carta de
// apresentação e prep de entrevista SEMPRE usam o CvAdaptation correto
// (o da própria candidatura) e a precedência correta de campos JSON —
// nunca vazam conteúdo de outra candidatura, nunca ignoram edição manual.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type {
  CoverLetterContent,
  CoverLetterContext,
} from "./cover-letter-ai.service";
import { JobApplicationCoverLetterService } from "./cover-letter.service";
import type {
  InterviewPrepContent,
  InterviewPrepContext,
} from "./interview-prep-ai.service";
import { JobApplicationInterviewPrepService } from "./interview-prep.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);

function makeRunId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function fakeFunnelEvents() {
  return { record: async () => undefined } as never;
}

function fakeCoverLetterAiService(capture: { context: CoverLetterContext | null }) {
  return {
    generate: async (context: CoverLetterContext): Promise<CoverLetterContent> => {
      capture.context = context;
      return { body: `${context.professionalSummary} carta`, characterCount: 10 };
    },
  } as never;
}

function fakeInterviewPrepAiService(capture: { context: InterviewPrepContext | null }) {
  return {
    generate: async (context: InterviewPrepContext): Promise<InterviewPrepContent> => {
      capture.context = context;
      return {
        strategySummary: context.structuredAnalysis?.fitHeadline ?? "",
        strengthsToHighlight: [],
        likelyRisksOrGaps: [],
        questionsTheyMayAsk: [],
        questionsCandidateShouldAsk: [],
        recommendedPosture: [],
        finalChecklist: [],
        lessonsFromPastProcesses: null,
      };
    },
  } as never;
}

function noopPdfDocx() {
  return {
    pdf: { generatePdf: async () => Buffer.from("") } as never,
    docx: { generateDocx: () => Buffer.from("") } as never,
  };
}

async function waitForStatus<T extends { status: string }>(
  fetch: () => Promise<T | null>,
  targetStatuses: string[],
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const row = await fetch();
    if (row && targetStatuses.includes(row.status)) return row;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout esperando status em [${targetStatuses.join(",")}]`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function makeUser(runId: string) {
  return database.user.create({
    data: { email: `${runId}-${randomUUID()}@example.com`, passwordHash: "x", name: runId },
  });
}

async function makeApplication(runId: string, userId: string, suffix: string) {
  return database.jobApplication.create({
    data: {
      userId,
      jobTitle: `${runId} Cargo ${suffix}`,
      companyName: `${runId} Empresa ${suffix}`,
      normalizedJobTitle: `${runId.toLowerCase()} cargo ${suffix}`,
      normalizedCompanyName: `${runId.toLowerCase()} empresa ${suffix}`,
      jobDescriptionText: `${runId} descrição da vaga ${suffix}`,
    },
  });
}

async function makeAdaptation(
  runId: string,
  userId: string,
  jobApplicationId: string,
  opts: {
    editedCvJson?: unknown;
    aiAuditJson?: unknown;
    adaptedContentJson?: unknown;
    isUnlocked?: boolean;
  },
) {
  return database.cvAdaptation.create({
    data: {
      userId,
      jobApplicationId,
      jobDescriptionText: `${runId} vaga`,
      status: "delivered",
      isUnlocked: opts.isUnlocked ?? true,
      editedCvJson: opts.editedCvJson as never,
      aiAuditJson: opts.aiAuditJson as never,
      adaptedContentJson: opts.adaptedContentJson as never,
    },
  });
}

async function cleanupRun(runId: string, userId: string): Promise<void> {
  await database.jobApplicationEvent.deleteMany({
    where: { jobApplication: { userId } },
  });
  await database.jobApplicationCoverLetter
    .deleteMany({ where: { jobApplication: { userId } } })
    .catch(() => undefined);
  await database.jobApplicationInterviewPrep
    .deleteMany({ where: { jobApplication: { userId } } })
    .catch(() => undefined);
  await database.cvAdaptation.deleteMany({ where: { userId } });
  await database.jobApplication.deleteMany({ where: { userId } });
  await database.user.deleteMany({ where: { id: userId } });
  void runId;
}

test("DOWNSTREAM 1 (carta): editedCvJson tem precedência sobre aiAuditJson/adaptedContentJson — sentinela ORIGEM_EDITADO chega ao contexto de IA, ORIGEM_IA_BRUTA não", async () => {
  const runId = makeRunId("downstream-1");
  const user = await makeUser(runId);
  try {
    const application = await makeApplication(runId, user.id, "A");
    const adaptation = await makeAdaptation(runId, user.id, application.id, {
      editedCvJson: { sections: [], summary: `${runId} ORIGEM_EDITADO`, highlightedSkills: [] },
      aiAuditJson: { sections: [], summary: `${runId} ORIGEM_IA_BRUTA`, highlightedSkills: [] },
      adaptedContentJson: { sections: [], summary: `${runId} ORIGEM_IA_ADAPTADA`, highlightedSkills: [] },
    });
    await database.jobApplication.update({
      where: { id: application.id },
      data: { currentCvAdaptationId: adaptation.id },
    });

    const capture: { context: CoverLetterContext | null } = { context: null };
    const { pdf, docx } = noopPdfDocx();
    const service = new JobApplicationCoverLetterService(
      database,
      fakeCoverLetterAiService(capture),
      fakeFunnelEvents(),
      pdf,
      docx,
    );

    await service.generateOrGet(user.id, application.id, {
      style: "formal",
      lengthMode: "media",
    });

    const letter = await waitForStatus(
      () => database.jobApplicationCoverLetter.findUnique({ where: { jobApplicationId: application.id } }),
      ["succeeded", "failed"],
    );
    assert.equal(letter.status, "succeeded");
    assert.equal(letter.cvAdaptationId, adaptation.id);

    assert.ok(capture.context);
    assert.ok(capture.context!.professionalSummary.includes("ORIGEM_EDITADO"));
    assert.ok(!capture.context!.professionalSummary.includes("ORIGEM_IA_BRUTA"));
    assert.ok(!capture.context!.professionalSummary.includes("ORIGEM_IA_ADAPTADA"));
  } finally {
    await cleanupRun(runId, user.id);
  }
});

test("DOWNSTREAM 2 (carta): adaptationId de OUTRA candidatura do mesmo usuário é rejeitado — nunca vaza CV de outra vaga", async () => {
  const runId = makeRunId("downstream-2");
  const user = await makeUser(runId);
  try {
    const applicationA = await makeApplication(runId, user.id, "A");
    const applicationB = await makeApplication(runId, user.id, "B");
    await makeAdaptation(runId, user.id, applicationA.id, {
      adaptedContentJson: { sections: [], summary: `${runId} ORIGEM_CANDIDATURA_A`, highlightedSkills: [] },
    });
    const adaptationB = await makeAdaptation(runId, user.id, applicationB.id, {
      adaptedContentJson: { sections: [], summary: `${runId} ORIGEM_CANDIDATURA_B`, highlightedSkills: [] },
    });

    const capture: { context: CoverLetterContext | null } = { context: null };
    const { pdf, docx } = noopPdfDocx();
    const service = new JobApplicationCoverLetterService(
      database,
      fakeCoverLetterAiService(capture),
      fakeFunnelEvents(),
      pdf,
      docx,
    );

    await assert.rejects(
      () =>
        service.generateOrGet(user.id, applicationA.id, {
          style: "formal",
          lengthMode: "media",
          adaptationId: adaptationB.id,
        }),
      ConflictException,
      "adaptationId de outra candidatura precisa ser rejeitado, nunca aceito silenciosamente",
    );

    const letter = await database.jobApplicationCoverLetter.findUnique({
      where: { jobApplicationId: applicationA.id },
    });
    assert.equal(letter, null, "nenhuma carta deve ter sido criada com a fonte errada");
    assert.equal(capture.context, null, "IA nunca deve ter sido chamada com o conteúdo da candidatura B");
  } finally {
    await cleanupRun(runId, user.id);
  }
});

test("DOWNSTREAM 3 (prep de entrevista): usa o CvAdaptation da PRÓPRIA candidatura — ORIGEM_CORRETA no structuredAnalysis, ORIGEM_OUTRA_CANDIDATURA nunca aparece", async () => {
  const runId = makeRunId("downstream-3");
  const user = await makeUser(runId);
  try {
    const applicationA = await makeApplication(runId, user.id, "A");
    const applicationB = await makeApplication(runId, user.id, "B");
    const adaptationA = await makeAdaptation(runId, user.id, applicationA.id, {
      adaptedContentJson: {
        pontos_fortes: [`${runId} ORIGEM_CORRETA ponto forte`],
        lacunas: [],
        melhorias_aplicadas: [],
        fit: { headline: `${runId} ORIGEM_CORRETA headline` },
      },
    });
    await database.jobApplication.update({
      where: { id: applicationA.id },
      data: { currentCvAdaptationId: adaptationA.id },
    });
    await makeAdaptation(runId, user.id, applicationB.id, {
      adaptedContentJson: {
        pontos_fortes: [`${runId} ORIGEM_OUTRA_CANDIDATURA ponto forte`],
        lacunas: [],
        melhorias_aplicadas: [],
        fit: { headline: `${runId} ORIGEM_OUTRA_CANDIDATURA headline` },
      },
    });

    const capture: { context: InterviewPrepContext | null } = { context: null };
    const service = new JobApplicationInterviewPrepService(
      database,
      fakeInterviewPrepAiService(capture),
      fakeFunnelEvents(),
    );

    await service.generateOrGet(user.id, applicationA.id);

    const prep = await waitForStatus(
      () => database.jobApplicationInterviewPrep.findUnique({ where: { jobApplicationId: applicationA.id } }),
      ["succeeded", "failed"],
    );
    assert.equal(prep.status, "succeeded");

    assert.ok(capture.context);
    const joined = JSON.stringify(capture.context);
    assert.ok(joined.includes("ORIGEM_CORRETA"));
    assert.ok(!joined.includes("ORIGEM_OUTRA_CANDIDATURA"));
  } finally {
    await cleanupRun(runId, user.id);
  }
});

test("DOWNSTREAM 4: retry (chamar generateOrGet de novo) não regenera nem troca de fonte — devolve a carta/prep já existente", async () => {
  const runId = makeRunId("downstream-4");
  const user = await makeUser(runId);
  try {
    const application = await makeApplication(runId, user.id, "A");
    const adaptation = await makeAdaptation(runId, user.id, application.id, {
      adaptedContentJson: { sections: [], summary: `${runId} ORIGEM_UNICA`, highlightedSkills: [] },
    });
    await database.jobApplication.update({
      where: { id: application.id },
      data: { currentCvAdaptationId: adaptation.id },
    });

    const capture: { context: CoverLetterContext | null } = { context: null };
    const { pdf, docx } = noopPdfDocx();
    const service = new JobApplicationCoverLetterService(
      database,
      fakeCoverLetterAiService(capture),
      fakeFunnelEvents(),
      pdf,
      docx,
    );

    const first = await service.generateOrGet(user.id, application.id, {
      style: "formal",
      lengthMode: "media",
    });
    await waitForStatus(
      () => database.jobApplicationCoverLetter.findUnique({ where: { id: first.id } }),
      ["succeeded", "failed"],
    );
    const callsAfterFirst = capture.context ? 1 : 0;

    const second = await service.generateOrGet(user.id, application.id, {
      style: "formal",
      lengthMode: "media",
    });

    assert.equal(second.id, first.id, "retry precisa devolver a MESMA carta, nunca criar outra");
    assert.equal(second.cvAdaptationId, adaptation.id);
    assert.equal(callsAfterFirst, 1, "IA precisa ter sido chamada exatamente uma vez até aqui");
  } finally {
    await cleanupRun(runId, user.id);
  }
});
