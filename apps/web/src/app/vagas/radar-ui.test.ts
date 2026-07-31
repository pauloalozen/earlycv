import { describe, expect, it } from "vitest";

import { scoreTier } from "./radar-ui";

describe("scoreTier", () => {
  it("classifica >=70 como alta compatibilidade", () => {
    expect(scoreTier(70)).toBe("high");
    expect(scoreTier(100)).toBe("high");
  });

  it("classifica 40-69 como compatibilidade média", () => {
    expect(scoreTier(40)).toBe("mid");
    expect(scoreTier(69)).toBe("mid");
  });

  it("classifica <40 como baixa compatibilidade", () => {
    expect(scoreTier(39)).toBe("low");
    expect(scoreTier(0)).toBe("low");
  });
});
