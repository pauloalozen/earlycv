import { describe, expect, it } from "vitest";

import {
  brtInputToIso,
  isoToBrtInput,
  parseEmailLines,
} from "./admin-emails-form";

describe("admin emails form helpers", () => {
  it("converts the Brasília datetime-local value to UTC ISO (UTC-3) and back", () => {
    expect(brtInputToIso("2026-10-15T08:00")).toBe("2026-10-15T11:00:00.000Z");
    expect(brtInputToIso("2026-10-15T23:30")).toBe("2026-10-16T02:30:00.000Z");
    expect(isoToBrtInput("2026-10-15T11:00:00.000Z")).toBe("2026-10-15T08:00");
    expect(isoToBrtInput("2026-10-16T02:30:00.000Z")).toBe("2026-10-15T23:30");
    expect(isoToBrtInput(brtInputToIso("2026-12-31T21:15"))).toBe(
      "2026-12-31T21:15",
    );
  });

  it("treats empty/invalid as no cutoff (null / empty)", () => {
    expect(brtInputToIso("")).toBeNull();
    expect(brtInputToIso("   ")).toBeNull();
    expect(brtInputToIso(null)).toBeNull();
    expect(brtInputToIso("ontem")).toBeNull();
    expect(isoToBrtInput(null)).toBe("");
    expect(isoToBrtInput("nope")).toBe("");
  });

  it("splits e-mail lists by newline/comma/semicolon and drops empties (format validation is the backend's job)", () => {
    expect(parseEmailLines("a@x.com\n b@y.com ,c@z.com;\n\n")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
    expect(parseEmailLines("")).toEqual([]);
    expect(parseEmailLines(null)).toEqual([]);
    expect(parseEmailLines("não-é-email")).toEqual(["não-é-email"]);
  });
});
