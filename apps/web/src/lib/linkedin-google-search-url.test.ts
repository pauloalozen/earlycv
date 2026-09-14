import { describe, expect, it } from "vitest";
import { buildLinkedinGoogleSearchUrl } from "./linkedin-google-search-url";

describe("buildLinkedinGoogleSearchUrl", () => {
  it("builds a google search url scoped to linkedin job posts", () => {
    const url = buildLinkedinGoogleSearchUrl("Engenheiro de Software", "Acme");
    const parsed = new URL(url);

    expect(parsed.hostname).toBe("www.google.com");
    expect(parsed.pathname).toBe("/search");
    expect(parsed.searchParams.get("q")).toBe(
      'site:linkedin.com/jobs/view "Engenheiro de Software" "Acme"',
    );
  });

  it("encodes special characters safely (quotes, accents, ampersands)", () => {
    const url = buildLinkedinGoogleSearchUrl(
      'Analista de Dados & "BI" Sênior',
      "Empresa & Cia",
    );
    const parsed = new URL(url);

    expect(parsed.searchParams.get("q")).toBe(
      'site:linkedin.com/jobs/view "Analista de Dados & "BI" Sênior" "Empresa & Cia"',
    );
    // A URL bruta não deve conter aspas/espaços/& crus fora do valor decodificado
    expect(url).not.toContain(" ");
    expect(url).toContain("q=");
  });

  it("does not throw and stays a valid https url for empty inputs", () => {
    const url = buildLinkedinGoogleSearchUrl("", "");
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
  });
});
