import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalyticsConsentBanner } from "./analytics-consent-banner";

describe("AnalyticsConsentBanner", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
    localStorage.removeItem("analytics_consent_status");
  });

  it("opens preferences when global event is dispatched", () => {
    localStorage.setItem("analytics_consent_status", "denied");
    render(<AnalyticsConsentBanner />);

    expect(screen.queryByText("Aceitar")).toBeNull();

    fireEvent(
      window,
      new CustomEvent("analytics-consent-preferences-open"),
    );

    expect(screen.getByText("Aceitar")).toBeTruthy();
  });
});
