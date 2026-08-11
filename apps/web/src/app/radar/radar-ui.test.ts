import { describe, expect, it } from "vitest";

import { scoreTier } from "./radar-ui";

describe("scoreTier", () => {
  it("classifica >=70 como alta compatibilidade", () => {
    expect(scoreTier(70)).toBe("high");
    expect(scoreTier(100)).toBe("high");
  });

  it("classifica 45-69 como compatibilidade média", () => {
    expect(scoreTier(45)).toBe("mid");
    expect(scoreTier(69)).toBe("mid");
  });

  it("classifica 25-44 como compatibilidade baixa", () => {
    expect(scoreTier(25)).toBe("low");
    expect(scoreTier(44)).toBe("low");
  });

  it("classifica <25 como compatibilidade muito baixa", () => {
    expect(scoreTier(24)).toBe("critical");
    expect(scoreTier(0)).toBe("critical");
  });
});
