import { describe, expect, it } from "vitest";

import { shouldShowIncidentBannerOnPathname } from "./incident-banner";

describe("shouldShowIncidentBannerOnPathname", () => {
  it("returns true for API-dependent routes", () => {
    expect(shouldShowIncidentBannerOnPathname("/entrar")).toBe(true);
    expect(shouldShowIncidentBannerOnPathname("/esqueceu-senha")).toBe(true);
    expect(shouldShowIncidentBannerOnPathname("/adaptar")).toBe(true);
    expect(shouldShowIncidentBannerOnPathname("/dashboard/historico")).toBe(
      true,
    );
    expect(shouldShowIncidentBannerOnPathname("/compras")).toBe(true);
    expect(shouldShowIncidentBannerOnPathname("/cv-base")).toBe(true);
    expect(shouldShowIncidentBannerOnPathname("/pagamento/checkout/abc")).toBe(
      true,
    );
  });

  it("returns false for public and static routes", () => {
    expect(shouldShowIncidentBannerOnPathname("/")).toBe(false);
    expect(shouldShowIncidentBannerOnPathname("/blog")).toBe(false);
    expect(shouldShowIncidentBannerOnPathname("/termos")).toBe(false);
  });
});
