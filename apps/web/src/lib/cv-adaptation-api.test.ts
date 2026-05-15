import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeGuestCv } from "./cv-adaptation-api.ts";
import { extractApiErrorMessage } from "./cv-adaptation-api-errors.ts";
import {
  appendTurnstileTokenToAnalyzeFormData,
  buildFunnelEventIdempotencyKey,
} from "./cv-adaptation-flow-helpers.ts";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cv adaptation flow helpers", () => {
  it("appendTurnstileTokenToAnalyzeFormData forwards token to form data", () => {
    const formData = new FormData();
    formData.set("jobDescriptionText", "foo");

    appendTurnstileTokenToAnalyzeFormData(formData, "tok-1");

    expect(formData.get("turnstileToken")).toBe("tok-1");
  });

  it("buildFunnelEventIdempotencyKey creates stable interaction key", () => {
    expect(
      buildFunnelEventIdempotencyKey({
        flowSessionId: "flow-1",
        attemptId: "attempt-1",
        eventName: "analyze_submit_clicked",
      }),
    ).toBe("flow-1:attempt-1:analyze_submit_clicked");
  });
});

describe("extractApiErrorMessage", () => {
  it("returns nested API message when response is JSON", () => {
    const raw = JSON.stringify({
      message: "Você não tem créditos de análise disponíveis.",
      error: "Bad Request",
      statusCode: 400,
    });

    expect(extractApiErrorMessage(raw, "Falha ao analisar CV.")).toBe(
      "Você não tem créditos de análise disponíveis.",
    );
  });

  it("joins array messages from validation responses", () => {
    const raw = JSON.stringify({
      message: [
        "masterResumeId must be a UUID",
        "jobDescriptionText is required",
      ],
      statusCode: 400,
    });

    expect(extractApiErrorMessage(raw, "Falha ao analisar CV.")).toBe(
      "masterResumeId must be a UUID | jobDescriptionText is required",
    );
  });

  it("falls back to trimmed plain text", () => {
    expect(
      extractApiErrorMessage(
        "  service unavailable  ",
        "Falha ao analisar CV.",
      ),
    ).toBe("service unavailable");
  });

  it("returns fallback for HTML challenge pages", () => {
    const raw =
      "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>challenge</body></html>";

    expect(extractApiErrorMessage(raw, "Falha ao analisar CV.")).toBe(
      "Falha ao analisar CV.",
    );
  });
});

describe("analyzeGuestCv request forwarding", () => {
  it("forwards turnstileToken from FormData to apiRequest/fetch", async () => {
    const fetchMock = vi.fn(
      async (..._args: unknown[]) =>
        new Response(
          JSON.stringify({
            adaptedContentJson: {
              vaga: { cargo: "", empresa: "" },
              fit: {
                score: 0,
                categoria: "baixo",
                headline: "",
                subheadline: "",
              },
              comparacao: { antes: "", depois: "" },
              pontos_fortes: [],
              lacunas: [],
              melhorias_aplicadas: [],
              ats_keywords: { presentes: [], ausentes: [] },
              preview: { antes: "", depois: "" },
              projecao_melhoria: {
                score_atual: 0,
                score_pos_otimizacao: 0,
                explicacao_curta: "",
              },
              mensagem_venda: { titulo: "", subtexto: "" },
            },
            previewText: "",
            masterCvText: "",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    formData.set("jobDescriptionText", "foo");
    formData.set("turnstileToken", "tok-1");

    await analyzeGuestCv(formData);

    expect(fetchMock).toHaveBeenCalledOnce();

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get("turnstileToken")).toBe("tok-1");
  });
});
