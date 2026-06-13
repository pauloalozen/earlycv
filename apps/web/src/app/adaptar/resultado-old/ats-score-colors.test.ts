import { describe, expect, it } from "vitest";
import { getAtsScoreColors } from "./ats-score-colors";

describe("getAtsScoreColors", () => {
  it("returns neon red for very low scores", () => {
    expect(getAtsScoreColors(24).primary).toBe("#ff2d55");
  });

  it("returns neon orange for low-mid scores", () => {
    expect(getAtsScoreColors(44).primary).toBe("#ff7a00");
  });

  it("returns neon yellow for mid scores", () => {
    expect(getAtsScoreColors(64).primary).toBe("#ffe600");
  });

  it("returns neon green for mid-high scores", () => {
    expect(getAtsScoreColors(84).primary).toBe("#78ff1f");
  });

  it("returns strong neon green for high scores", () => {
    expect(getAtsScoreColors(85).primary).toBe("#39ff14");
  });

  it("returns transparent projected color based on primary", () => {
    expect(getAtsScoreColors(70).projected).toBe("rgba(120,255,31,0.18)");
  });
});
