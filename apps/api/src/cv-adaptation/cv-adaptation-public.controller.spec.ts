import assert from "node:assert/strict";
import { test } from "node:test";

import { CvAdaptationPublicController } from "./cv-adaptation-public.controller";

// Fase 2 do gate de autenticação: a rota pública GET /cv-adaptation/analysis-jobs/:jobId
// precisa rotear para o caminho status-only (getGuestAnalysisJobStatusOnly)
// exatamente quando a requisição não está autenticada E a flag está ligada —
// e nunca nos outros três casos, para preservar rollback e o fluxo
// authenticated existente. Ver
// specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-ADENDO-hardening.md.

const makeReq = (userId: string | null) =>
  ({
    analysisContext: {
      userId,
      sessionPublicToken: "session-token",
    },
  }) as never;

test("guest + flag ON: routes to getGuestAnalysisJobStatusOnly with the possession token header, never the full-content path", async () => {
  let calledFull = false;
  let calledGuestOnly = false;
  let receivedToken: string | null | undefined;

  const controller = new CvAdaptationPublicController(
    {
      getAnalysisJobStatus: async () => {
        calledFull = true;
        return {};
      },
      getGuestAnalysisJobStatusOnly: async (
        _jobId: string,
        token: string | null,
      ) => {
        calledGuestOnly = true;
        receivedToken = token;
        return { status: "processing" };
      },
    } as never,
    {
      getBoolean: async () => ({ value: true }),
    } as never,
  );

  const result = await controller.getAnalysisJobStatus(
    makeReq(null),
    "job-1",
    "raw-possession-token",
  );

  assert.equal(calledGuestOnly, true);
  assert.equal(calledFull, false);
  assert.equal(receivedToken, "raw-possession-token");
  assert.deepEqual(result, { status: "processing" });
});

test("guest + flag OFF: preserves current behavior, routes to getAnalysisJobStatus", async () => {
  let calledFull = false;
  let calledGuestOnly = false;

  const controller = new CvAdaptationPublicController(
    {
      getAnalysisJobStatus: async () => {
        calledFull = true;
        return { adaptedContentJson: { ok: true }, status: "succeeded" };
      },
      getGuestAnalysisJobStatusOnly: async () => {
        calledGuestOnly = true;
        return { status: "succeeded" };
      },
    } as never,
    {
      getBoolean: async () => ({ value: false }),
    } as never,
  );

  const result = await controller.getAnalysisJobStatus(makeReq(null), "job-1");

  assert.equal(calledFull, true);
  assert.equal(calledGuestOnly, false);
  assert.deepEqual(result, {
    adaptedContentJson: { ok: true },
    status: "succeeded",
  });
});

test("authenticated caller: always routes to getAnalysisJobStatus, regardless of the flag value", async () => {
  let calledFull = false;
  let calledGuestOnly = false;

  const controller = new CvAdaptationPublicController(
    {
      getAnalysisJobStatus: async (
        _jobId: string,
        input: { userId: string | null },
      ) => {
        calledFull = true;
        assert.equal(input.userId, "user-1");
        return { adaptedContentJson: { ok: true }, status: "succeeded" };
      },
      getGuestAnalysisJobStatusOnly: async () => {
        calledGuestOnly = true;
        return { status: "succeeded" };
      },
    } as never,
    {
      // Mesmo com a flag ligada, um caller autenticado nunca deve cair no
      // caminho status-only — esse caminho existe só para restringir
      // não autenticado.
      getBoolean: async () => ({ value: true }),
    } as never,
  );

  const result = await controller.getAnalysisJobStatus(
    makeReq("user-1"),
    "job-1",
  );

  assert.equal(calledFull, true);
  assert.equal(calledGuestOnly, false);
  assert.deepEqual(result, {
    adaptedContentJson: { ok: true },
    status: "succeeded",
  });
});

test("guest + flag ON, no possession token header: still routes to getGuestAnalysisJobStatusOnly with null, never the full-content path", async () => {
  let calledFull = false;
  let receivedToken: string | null | undefined = "not-set";

  const controller = new CvAdaptationPublicController(
    {
      getAnalysisJobStatus: async () => {
        calledFull = true;
        return {};
      },
      getGuestAnalysisJobStatusOnly: async (
        _jobId: string,
        token: string | null,
      ) => {
        receivedToken = token;
        return { status: "pending" };
      },
    } as never,
    {
      getBoolean: async () => ({ value: true }),
    } as never,
  );

  await controller.getAnalysisJobStatus(makeReq(null), "job-1", undefined);

  assert.equal(calledFull, false);
  assert.equal(receivedToken, null);
});
