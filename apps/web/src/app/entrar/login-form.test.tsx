import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoginForm } from "./login-form";

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

describe("LoginForm identity context propagation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: makeLocalStorageStub(),
    });
  });

  afterEach(() => {
    cleanup();
    sessionStorage.removeItem("journey_session_internal_id");
  });

  it("does not render a sessionInternalId field before it is read from sessionStorage", () => {
    const { container } = render(<LoginForm next="" />);

    const hiddenInput = container.querySelector(
      'input[name="sessionInternalId"]',
    );
    expect(hiddenInput).toBeNull();
  });

  it("renders the sessionInternalId hidden field once sessionStorage has a journey session id", () => {
    sessionStorage.setItem("journey_session_internal_id", "journey-abc-123");

    const { container } = render(<LoginForm next="" />);

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="sessionInternalId"]',
    );
    expect(hiddenInput?.value).toBe("journey-abc-123");
  });

  it("renders the visitorId hidden field with a UUID once consent allows creating it (Fase C)", () => {
    localStorage.setItem("analytics_consent_status", "accepted");

    const { container } = render(<LoginForm next="" />);

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="visitorId"]',
    );
    expect(hiddenInput?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("does not render the visitorId hidden field without analytics consent", () => {
    const { container } = render(<LoginForm next="" />);

    const hiddenInput = container.querySelector('input[name="visitorId"]');
    expect(hiddenInput).toBeNull();
  });
});
