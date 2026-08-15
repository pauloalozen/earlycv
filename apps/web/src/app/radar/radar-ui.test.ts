import { describe, expect, it } from "vitest";

import { opportunityLevel, scoreTier } from "./radar-ui";

describe("opportunityLevel", () => {
  it("classifica 90-100 como nível 5 (Excelente oportunidade)", () => {
    expect(opportunityLevel(100).level).toBe(5);
    expect(opportunityLevel(90).level).toBe(5);
  });

  it("classifica 75-89 como nível 4 (Muito aderente)", () => {
    expect(opportunityLevel(89).level).toBe(4);
    expect(opportunityLevel(75).level).toBe(4);
  });

  it("classifica 55-74 como nível 3 (Aderente)", () => {
    expect(opportunityLevel(74).level).toBe(3);
    expect(opportunityLevel(55).level).toBe(3);
  });

  it("classifica 35-54 como nível 2 (Pouco aderente)", () => {
    expect(opportunityLevel(54).level).toBe(2);
    expect(opportunityLevel(35).level).toBe(2);
  });

  it("classifica 15-34 como nível 1 (Baixa aderência)", () => {
    expect(opportunityLevel(34).level).toBe(1);
    expect(opportunityLevel(15).level).toBe(1);
  });

  it("classifica 0-14 como nível 0 (Não recomendada)", () => {
    expect(opportunityLevel(14).level).toBe(0);
    expect(opportunityLevel(0).level).toBe(0);
  });

  it("expõe o label categórico correspondente a cada nível", () => {
    expect(opportunityLevel(92).label).toBe("Excelente oportunidade");
    expect(opportunityLevel(68).label).toBe("Aderente");
  });
});

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
