import { describe, expect, it } from "vitest";

import {
  buildClaimResultDestination,
  type ClaimGuestAnalysisJobResult,
} from "./guest-analysis-claim.server";

// Fase 5 do gate de autenticação guest: buildClaimResultDestination decide
// pra onde mandar o usuário logo após login/cadastro/OAuth — nunca deve
// travar esse fluxo, mesmo quando o claim falha.

describe("buildClaimResultDestination", () => {
  it("routes to the ready result page when the claim already succeeded", () => {
    const result: ClaimGuestAnalysisJobResult = {
      status: "succeeded",
      cvAdaptationId: "adapt-1",
    };
    expect(buildClaimResultDestination(result, "job-1", "/dashboard")).toBe(
      "/adaptar/resultado?adaptationId=adapt-1",
    );
  });

  it("routes to the polling page (claimJobId) when the job is still pending or processing", () => {
    for (const status of ["pending", "processing"] as const) {
      const result: ClaimGuestAnalysisJobResult = { status };
      expect(buildClaimResultDestination(result, "job-1", "/dashboard")).toBe(
        "/adaptar/resultado?claimJobId=job-1",
      );
    }
  });

  it("falls back to the provided destination when the analysis failed — never blocks login", () => {
    const result: ClaimGuestAnalysisJobResult = { status: "failed" };
    expect(buildClaimResultDestination(result, "job-1", "/dashboard")).toBe(
      "/dashboard",
    );
  });

  it("falls back to the provided destination on a claim call error — never blocks login", () => {
    const result: ClaimGuestAnalysisJobResult = { status: "error" };
    expect(buildClaimResultDestination(result, "job-1", "/meu-perfil")).toBe(
      "/meu-perfil",
    );
  });
});
