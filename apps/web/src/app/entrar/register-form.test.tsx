import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegisterForm } from "./register-form";

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe("RegisterForm conversion context propagation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: makeLocalStorageStub(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("submits the conversionContext prop explicitly as a hidden field, never inferred client-side", () => {
    const { container } = render(
      <RegisterForm next="" conversionContext="analysis_guest" />,
    );

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="conversionContext"]',
    );

    expect(hiddenInput).not.toBeNull();
    expect(hiddenInput?.value).toBe("analysis_guest");
  });

  it("submits direct_auth when the page resolved no explicit context", () => {
    const { container } = render(
      <RegisterForm next="" conversionContext="direct_auth" />,
    );

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="conversionContext"]',
    );

    expect(hiddenInput?.value).toBe("direct_auth");
  });

  it("does not render a sessionInternalId field before it is read from sessionStorage", () => {
    const { container } = render(
      <RegisterForm next="" conversionContext="radar" />,
    );

    // jsdom's sessionStorage starts empty in this test, so the effect
    // that reads journey_session_internal_id resolves to "" and the
    // hidden field must not render (matches the `{sessionInternalId && ...}` guard).
    const hiddenInput = container.querySelector(
      'input[name="sessionInternalId"]',
    );
    expect(hiddenInput).toBeNull();
  });

  it("renders the sessionInternalId hidden field once sessionStorage has a journey session id", () => {
    sessionStorage.setItem("journey_session_internal_id", "journey-abc-123");

    const { container } = render(
      <RegisterForm next="" conversionContext="checkout" />,
    );

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="sessionInternalId"]',
    );
    expect(hiddenInput?.value).toBe("journey-abc-123");

    sessionStorage.removeItem("journey_session_internal_id");
  });

  it("renders the visitorId hidden field with a UUID once localStorage resolves it (Fase C)", () => {
    localStorage.setItem("analytics_consent_status", "accepted");

    const { container } = render(
      <RegisterForm next="" conversionContext="direct_auth" />,
    );

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="visitorId"]',
    );
    expect(hiddenInput?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    localStorage.removeItem("earlycv_visitor_id");
    localStorage.removeItem("analytics_consent_status");
  });

  it("does not render the visitorId hidden field without analytics consent", () => {
    localStorage.removeItem("analytics_consent_status");
    localStorage.removeItem("earlycv_visitor_id");

    const { container } = render(
      <RegisterForm next="" conversionContext="direct_auth" />,
    );

    const hiddenInput = container.querySelector('input[name="visitorId"]');
    expect(hiddenInput).toBeNull();
  });
});
