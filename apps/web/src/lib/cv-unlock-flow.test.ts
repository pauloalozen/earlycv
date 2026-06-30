import { describe, expect, it } from "vitest";

import { buildCvUnlockPlansHref } from "./cv-unlock-flow";

describe("buildCvUnlockPlansHref", () => {
  it("builds minimal URL with aid, source and next", () => {
    const href = buildCvUnlockPlansHref({
      adaptationId: "adp_123",
      source: "dashboard-candidatura-unlock",
      nextPath: "/candidaturas/cmp_1",
    });

    expect(href).toBe(
      "/planos?aid=adp_123&source=dashboard-candidatura-unlock&next=%2Fcandidaturas%2Fcmp_1",
    );
  });

  it("appends sanitized kw values", () => {
    const href = buildCvUnlockPlansHref({
      adaptationId: "adp_123",
      source: "resultado-buy-credits",
      nextPath: "/candidaturas/cmp_1",
      keywords: [" sql ", "", "python"],
    });

    expect(href).toContain("kw=sql");
    expect(href).toContain("kw=python");
    expect(href).not.toContain("kw=%20");
  });

  it("falls back to /planos when adaptationId is empty", () => {
    const href = buildCvUnlockPlansHref({
      adaptationId: "",
      source: "dashboard-candidatura-unlock",
      nextPath: "/candidaturas/cmp_1",
    });

    expect(href).toBe("/planos");
  });
});
