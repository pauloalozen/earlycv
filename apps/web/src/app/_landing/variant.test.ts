import { describe, expect, it } from "vitest";
import { resolveLandingVariant } from "./variant";

describe("resolveLandingVariant", () => {
  it("returns variant A by default", () => {
    expect(resolveLandingVariant(undefined)).toBe("A");
    expect(resolveLandingVariant("")).toBe("A");
    expect(resolveLandingVariant("invalid")).toBe("A");
  });

  it("accepts explicit variant values", () => {
    expect(resolveLandingVariant("A")).toBe("A");
    expect(resolveLandingVariant("B")).toBe("B");
  });
});
