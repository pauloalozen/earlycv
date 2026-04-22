import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  AnalysisProtectionFacade,
  ProtectedAnalysisResult,
} from "../analysis-protection/analysis-protection.facade";
import type { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import { CvAdaptationProtectedAnalyzeService } from "./cv-adaptation-protected-analyze.service";

test("does not invoke AI provider when protected analysis is blocked", async () => {
  let runProviderCalls = 0;
  const aiCalls: Array<{ jobDescriptionText: string; masterCvText: string }> =
    [];
  const protectionFacadeMock: Pick<
    AnalysisProtectionFacade,
    "executeProtectedAnalysis"
  > = {
    executeProtectedAnalysis: async <_TPayload, TResult>() => {
      return {
        message: "blocked",
        ok: false,
        reason: "turnstile_invalid",
      } as ProtectedAnalysisResult<TResult>;
    },
  };
  const aiServiceMock: Pick<CvAdaptationAiService, "analyzeAndAdaptDirect"> = {
    analyzeAndAdaptDirect: async (
      masterCvText: string,
      jobDescriptionText: string,
    ) => {
      runProviderCalls += 1;
      aiCalls.push({ jobDescriptionText, masterCvText });
      return { adaptedContentJson: { ok: true }, previewText: "preview" };
    },
  };

  const service = new CvAdaptationProtectedAnalyzeService(
    protectionFacadeMock as AnalysisProtectionFacade,
    aiServiceMock as CvAdaptationAiService,
  );

  const result = await service.executeProtectedAnalyze({
    context: {
      correlationId: "corr",
      ip: "203.0.113.10",
      requestId: "req",
      routeKey: "cv-adaptation/analyze",
      sessionInternalId: null,
      sessionPublicToken: null,
      userId: "user-1",
    },
    jobDescriptionText: "JD",
    loadMasterCvText: async () => "CV",
    payload: { route: "cv-adaptation/analyze" },
    turnstileToken: "token",
  });

  assert.equal(result.ok, false);
  assert.equal(runProviderCalls, 0);
  assert.equal(aiCalls.length, 0);
});

test("does not invoke paid guest output builder when protected analysis is blocked", async () => {
  let paidBuilderCalls = 0;
  const protectionFacadeMock: Pick<
    AnalysisProtectionFacade,
    "executeProtectedAnalysis"
  > = {
    executeProtectedAnalysis: async <_TPayload, TResult>() => {
      return {
        message: "blocked",
        ok: false,
        reason: "anti_bot_blocked",
      } as ProtectedAnalysisResult<TResult>;
    },
  };
  const aiServiceMock: Pick<
    CvAdaptationAiService,
    "buildPaidCvOutputFromGuest"
  > = {
    buildPaidCvOutputFromGuest: async () => {
      paidBuilderCalls += 1;
      return {
        summary: "summary",
        sections: [],
        highlightedSkills: [],
        removedSections: [],
      };
    },
  };

  const service = new CvAdaptationProtectedAnalyzeService(
    protectionFacadeMock as AnalysisProtectionFacade,
    aiServiceMock as CvAdaptationAiService,
  );

  const result = await service.executeProtectedBuildPaidCvOutputFromGuest({
    companyName: "Acme",
    context: {
      correlationId: "corr",
      ip: null,
      requestId: "req",
      routeKey: "cv-adaptation/internal-paid-output",
      sessionInternalId: null,
      sessionPublicToken: null,
      userId: "user-1",
    },
    jobDescriptionText: "JD",
    jobTitle: "Engineer",
    masterCvText: "CV",
    payload: { route: "cv-adaptation/internal-paid-output" },
  });

  assert.equal(result.ok, false);
  assert.equal(paidBuilderCalls, 0);
});
